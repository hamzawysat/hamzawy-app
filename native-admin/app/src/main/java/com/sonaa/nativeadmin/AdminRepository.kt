package com.sonaa.nativeadmin
import android.content.Context
import android.net.Uri
import java.io.File
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Retrofit
import retrofit2.HttpException
import com.google.gson.JsonParser
import retrofit2.converter.gson.GsonConverterFactory
class AdminRepository(context:Context){
 private val appContext=context.applicationContext
 private val auth=AuthStore(context.applicationContext)
 private val client=OkHttpClient.Builder().addInterceptor{chain->
  val token=runBlocking{auth.currentToken()}
  val req=chain.request().newBuilder().apply{if(!token.isNullOrBlank())header("Authorization","Bearer $token");header("Accept","application/json")}.build()
  chain.proceed(req)
 }.build()
 private val api=Retrofit.Builder().baseUrl("https://www.hamzawy-sat.dynv6.net/").client(client).addConverterFactory(GsonConverterFactory.create()).build().create(AdminApi::class.java)
 suspend fun login(phone:String,password:String):JsonElement{
  val response=api.login(JsonObject().apply{addProperty("phone",phone.trim());addProperty("password",password)})
  val token=response.asJsonObject.get("token")?.asString?:error("الخادم لم يُرجع رمز الجلسة")
  auth.saveToken(token);return response
 }
 suspend fun getMe():JsonElement=api.me()
 suspend fun hasSession():Boolean{if(auth.currentToken().isNullOrBlank())return false;return try{api.me();true}catch(_:Exception){auth.clear();false}}
 suspend fun logout(){
  val registered=appContext.getSharedPreferences("sonaa_admin_session",Context.MODE_PRIVATE).getString("registered_fcm_token",null)
  if(!registered.isNullOrBlank())runCatching{api.unregisterFcmToken(JsonObject().apply{addProperty("token",registered)})}
  appContext.getSharedPreferences("sonaa_admin_session",Context.MODE_PRIVATE).edit().remove("registered_fcm_token").remove("pending_fcm_token").apply()
  auth.clear()
 }
 suspend fun get(section:AdminSection):JsonElement=when(section.method){
  "POST"->api.post(section.path,section.defaultBody())
  else->api.get(section.path)
 }
 suspend fun get(path:String):JsonElement=try{api.get(path)}catch(e:HttpException){throw apiFailure(e)}
 private fun apiFailure(e:HttpException):IllegalStateException{
  val response=e.response()
  val raw=runCatching{response?.errorBody()?.string().orEmpty()}.getOrDefault("")
  val serverMessage=runCatching{
   val parsed=JsonParser.parseString(raw)
   if(parsed.isJsonObject)parsed.asJsonObject.get("message")?.takeIf{!it.isJsonNull}?.asString else null
  }.getOrNull()
  val detail=serverMessage?.takeIf{it.isNotBlank()}?:raw.replace(Regex("\\s+")," ").take(180).ifBlank{"لم يُرجع الخادم تفاصيل إضافية"}
  val requestPath=response?.raw()?.request?.url?.encodedPath.orEmpty()
  return IllegalStateException("فشل الطلب (HTTP ${e.code()}): $detail"+if(requestPath.isNotBlank())"\nالمسار: $requestPath" else "",e)
 }
 suspend fun uploadStoreMedia(uri:Uri,purpose:String):JsonElement=withContext(Dispatchers.IO){
  if(purpose !in listOf("product","category"))error("نوع صورة المتجر غير صالح")
  val mime=appContext.contentResolver.getType(uri)?.substringBefore(";")?.lowercase()?:error("تعذر تحديد نوع الصورة")
  if(mime !in listOf("image/jpeg","image/png","image/webp"))error("اختار صورة JPG أو PNG أو WebP")
  val sourceBytes=appContext.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("تعذر قراءة ملف الصورة")
  if(sourceBytes.isEmpty()||sourceBytes.size>20*1024*1024)error("حجم الصورة الأصلية يجب ألا يتجاوز 20 ميجابايت")
  var bytes=sourceBytes
  var uploadMime=mime
  val bounds=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true}
  android.graphics.BitmapFactory.decodeByteArray(sourceBytes,0,sourceBytes.size,bounds)
  if(sourceBytes.size>5*1024*1024||maxOf(bounds.outWidth,bounds.outHeight)>1600){
   if(bounds.outWidth>0&&bounds.outHeight>0){
    var sample=1
    while(maxOf(bounds.outWidth/(sample*2),bounds.outHeight/(sample*2))>=1600)sample*=2
    val options=android.graphics.BitmapFactory.Options().apply{inSampleSize=sample}
    val bitmap=android.graphics.BitmapFactory.decodeByteArray(sourceBytes,0,sourceBytes.size,options)
    if(bitmap!=null){
     try{
      val scale=minOf(1f,1600f/maxOf(bitmap.width,bitmap.height))
      val resized=if(scale<1f)android.graphics.Bitmap.createScaledBitmap(bitmap,(bitmap.width*scale).toInt().coerceAtLeast(1),(bitmap.height*scale).toInt().coerceAtLeast(1),true) else bitmap
      try{
       var compressed:ByteArray?=null
       for(quality in listOf(82,72,62)){
        val output=java.io.ByteArrayOutputStream()
        resized.compress(android.graphics.Bitmap.CompressFormat.WEBP,quality,output)
        val candidate=output.toByteArray()
        if(candidate.size<=5*1024*1024&&candidate.size<sourceBytes.size){compressed=candidate;break}
       }
       if(compressed!=null){bytes=compressed;uploadMime="image/webp"}
      }finally{if(resized!==bitmap)resized.recycle()}
     }finally{bitmap.recycle()}
    }
   }
  }
  if(bytes.size>5*1024*1024)error("حجم الصورة بعد الضغط يجب ألا يتجاوز 5 ميجابايت. اختار صورة أصغر.")
  try{api.uploadStoreMedia("api/admin/store/media?purpose=$purpose",uploadMime,bytes.toRequestBody(uploadMime.toMediaType()))}
  catch(e:HttpException){throw apiFailure(e)}
 }
 suspend fun downloadFanniIdentity(id:String,side:String):File=withContext(Dispatchers.IO){
  if(side !in listOf("front","back"))error("وجه البطاقة غير صالح")
  val response=api.getVoice("api/fanni/admin/"+id+"/identity/"+side)
  if(!response.isSuccessful)throw apiFailure(HttpException(response))
  val bytes=response.body()?.bytes()?:error("ملف صورة البطاقة فارغ")
  if(bytes.isEmpty()||bytes.size>10*1024*1024)error("حجم صورة البطاقة غير صالح")
  val file=File(appContext.cacheDir,"fanni-identity-"+id+"-"+side+"-"+System.currentTimeMillis()+".img")
  file.writeBytes(bytes)
  file
 }
 suspend fun downloadVoice(sn:String):File{
  val response=api.getVoice("api/orders/${sn}/voice")
  if(!response.isSuccessful)error("تعذر تحميل التسجيل الصوتي (HTTP ${response.code()})")
  val bytes=response.body()?.bytes()?:error("ملف التسجيل فارغ")
  val file=File(appContext.cacheDir,"order-${sn}-voice.audio")
  file.writeBytes(bytes)
  return file
 }
 suspend fun mutate(method:String,path:String,body:JsonObject=JsonObject()):JsonElement=try{
  when(method.uppercase()){
   "POST"->api.post(path,body);"PATCH"->api.patch(path,body);"PUT"->api.put(path,body);"DELETE"->api.delete(path);else->error("طريقة غير مدعومة")
  }
 }catch(e:HttpException){throw apiFailure(e)}
 suspend fun registerFcm(token:String){
  val prefs=appContext.getSharedPreferences("sonaa_admin_session",Context.MODE_PRIVATE)
  val previous=prefs.getString("registered_fcm_token",null)
  if(!previous.isNullOrBlank()&&previous!=token)runCatching{api.unregisterFcmToken(JsonObject().apply{addProperty("token",previous)})}
  api.registerFcmToken(JsonObject().apply{addProperty("token",token);addProperty("platform","fcm-android")})
  prefs.edit().putString("registered_fcm_token",token).remove("pending_fcm_token").apply()
 }
}
enum class AdminSection(
 val title:String,
 val path:String,
 val keys:List<String>,
 val method:String="GET"
){
 DASHBOARD("الرئيسية","api/admin/counts",listOf("counts","data")),
 STATS("الإحصائيات","api/admin/stats",listOf("counts","stats","data")),
 ORDERS("طلبات العملاء","api/admin/orders",listOf("orders","data","items")),
 TECHNICIANS("كل الفنيين","api/admin/fannis",listOf("fannis","technicians","data","items")),
 PENDING("انتظار اعتماد الفنيين","api/admin/fannis",listOf("fannis","technicians","data","items")),
 PROFILE_EDITS("طلبات تعديل البيانات","api/admin/fanni-profile-edits",listOf("requests","edits","data","items")),
 DISABLED("الفنيون الموقوفون","api/admin/fannis",listOf("fannis","technicians","data","items")),
 LEVELS("المستويات والشارات","api/admin/fannis",listOf("fannis","data","items")),
 OFFERS("عروض الفنيين","api/admin/orders",listOf("orders","data","items")),
 WALLETS("محافظ الفنيين","api/admin/fannis",listOf("fannis","data","items")),
 TOPUPS("طلبات شحن المحافظ","api/admin/topup-requests",listOf("requests","data","items")),
 SERVICES("المهن والخدمات","api/admin/services",listOf("services","data","items")),
 REGIONS("مناطق الخدمة","api/admin/regions",listOf("regions","items","data")),
 COMPLAINTS("الشكاوى","api/admin/complaints",listOf("complaints","data","items")),
 SUPPORT("الدعم والمخالفات","api/admin/support/violations",listOf("violations","cases","data","items")),
 RECOVERY("طلبات استعادة كلمة المرور","api/password-recovery/admin/requests",listOf("recoveries","items","data")),
 NOTIFICATIONS("الإشعارات","api/admin/notifications/direct",listOf("notifications","campaigns","data","items")),
 CONTENT("الإعلانات والأسئلة الشائعة","api/admin/content",listOf("faqs","content","data")),
 PRICING("الأسعار والعمولات","api/admin/pricing",listOf("pricing","data","history")),
 REPORTS("التقارير","api/admin/reports",listOf("summary","topServices","data"),"POST"),
 PAGE_VISITS("سجل زيارات الموقع","api/admin/page-visits",listOf("recent","summary","data")),
 SECURITY("سجل التدقيق والأمان","api/admin/audit-logs",listOf("logs","items","data")),
 SETTINGS("إعدادات المنصة","api/admin/settings",listOf("settings","data")),
 ROLES("صلاحيات المشرفين","api/admin/admin-users",listOf("users","admins","data","items")),
 UI_LAYOUT("محرر تخطيط الواجهات","api/admin/ui-layout/admin",listOf("layout","data")),
 CLIENTS("كل العملاء","api/admin/clients",listOf("clients","items","data")),
 CLIENT_WALLETS("محافظ العملاء","api/admin/client-wallet/accounts",listOf("accounts","data","items")),
 CLIENT_TOPUPS("طلبات شحن محافظ العملاء","api/admin/client-wallet/topup-requests",listOf("requests","data","items")),
 COMMERCE_PLANS("باقات الاشتراك","api/admin/commerce/catalog",listOf("items","data")),
 CLIENT_SUBSCRIPTIONS("اشتراكات العملاء","api/admin/commerce/subscriptions",listOf("subscriptions","data","items")),
 STORE_PRODUCTS("منتجات المتجر","api/admin/store/products",listOf("products","data","items")),
 STORE_ORDERS("طلبات ومبيعات المتجر","api/admin/store/orders",listOf("orders","data","items"));
 fun defaultBody()=JsonObject()
 fun extract(p:JsonElement):List<JsonElement>{
  if(p.isJsonArray)return p.asJsonArray.map{it}
  if(!p.isJsonObject)return emptyList()
  val obj=p.asJsonObject
  for(k in keys){val v=obj.get(k)?:continue;if(v.isJsonArray)return v.asJsonArray.map{it}}
  val data=obj.get("data")
  if(data?.isJsonObject==true){for(k in keys){val v=data.asJsonObject.get(k)?:continue;if(v.isJsonArray)return v.asJsonArray.map{it}}}
  return emptyList()
 }
}
