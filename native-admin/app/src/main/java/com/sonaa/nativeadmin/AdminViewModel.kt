package com.sonaa.nativeadmin
import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
data class AdminUiState(val checking:Boolean=true,val authenticated:Boolean=false,val adminInfo:JsonElement?=null,val busy:Boolean=false,val error:String?=null,val section:AdminSection=AdminSection.DASHBOARD,val stats:JsonElement?=null,val items:List<JsonElement> = emptyList(),val actionMessage:String?=null,val payload:JsonElement?=null,val voicePath:String?=null,val editingProfile:JsonElement?=null,val editingProfileId:String?=null,val walletFanniId:String?=null,val walletTransactions:List<JsonElement> = emptyList(),val editingClient:JsonElement?=null,val editingClientId:String?=null,val recoveryDetail:JsonElement?=null,val recoveryDetailId:String?=null,val supportCases:List<JsonElement> = emptyList(),val supportViolations:List<JsonElement> = emptyList(),val supportSearchResults:List<JsonElement> = emptyList(),val supportSelectedCase:JsonElement?=null,val supportPasswordText:String?=null,val supportPasswordTitle:String="كلمة دعم العميل",val sectionSearch:String="",val storeUploadedImageUrl:String?=null,val storeUploadedImageFileId:String?=null,val identityFanniId:String?=null,val identityFrontPath:String?=null,val identityBackPath:String?=null,val adminInbox:List<JsonElement> = emptyList(),val adminUnreadCount:Int=0,val notificationDeliveries:List<JsonElement> = emptyList(),val adminNotificationError:String?=null,val uiLayoutPage:String="admin")
class AdminViewModel(app:Application):AndroidViewModel(app){
 private val repo=AdminRepository(app)
 private val _state=MutableStateFlow(AdminUiState())
 val state=_state.asStateFlow()
 fun restore()=viewModelScope.launch{
  val ok=repo.hasSession()
  if(ok){try{val me=repo.getMe();_state.value=_state.value.copy(checking=false,authenticated=true,adminInfo=me);refresh()}catch(e:Exception){repo.logout();_state.value=AdminUiState(checking=false,error=e.message)}} 
  else _state.value=_state.value.copy(checking=false,authenticated=false,adminInfo=null)
 }
 fun login(phone:String,password:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null)
  try{repo.login(phone,password);val me=repo.getMe();_state.value=_state.value.copy(busy=false,authenticated=true,adminInfo=me);refresh()}
  catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تسجيل الدخول")}
 }
 private suspend fun enrichStoreProducts(source:JsonElement):JsonElement{
  val root=source.takeIf{it.isJsonObject}?.asJsonObject?.deepCopy()?:return source
  runCatching{repo.get("api/admin/store/ad-settings")}.onSuccess{root.add("storeAdSettings",it)}.onFailure{root.addProperty("storeAdSettingsError",it.message?: "تعذر تحميل إعدادات الإعلانات")}
  return root
 }
 private suspend fun enrichStoreOrders(source:JsonElement):JsonElement{
  val root=source.takeIf{it.isJsonObject}?.asJsonObject?.deepCopy()?:return source
  runCatching{repo.get("api/admin/store/orders/count")}.onSuccess{root.add("storeOrderCount",it)}
  return root
 }
 private suspend fun enrichDashboard(source:JsonElement):JsonElement{
  val root=source.takeIf{it.isJsonObject}?.asJsonObject?.deepCopy()?:return source
  val warnings=com.google.gson.JsonArray()
  fun findArray(response:JsonElement?,vararg keys:String):com.google.gson.JsonArray?{
   if(response==null)return null
   if(response.isJsonArray)return response.asJsonArray
   if(response.isJsonObject){for(key in keys){val value=response.asJsonObject.get(key);if(value?.isJsonArray==true)return value.asJsonArray}}
   return null
  }
  suspend fun attach(path:String,targetKey:String,label:String,vararg keys:String){
   val response=runCatching{repo.get(path)}.getOrNull()
   val rows=findArray(response,*keys)
   if(rows!=null)root.add(targetKey,rows)
   else warnings.add("$label: تعذر تحميل البيانات أو لم يُرجع الخادم قائمة صالحة")
  }
  suspend fun attachOptional(path:String,targetKey:String,vararg keys:String){
   val response=runCatching{repo.get(path)}.getOrNull()?:return
   findArray(response,*keys)?.let{root.add(targetKey,it)}
  }
  attach("api/admin/orders","dashboardOrders","الطلبات","orders","data","items")
  attach("api/admin/topup-requests","dashboardTopups","طلبات الشحن","requests","topups","data","items")
  attach("api/admin/complaints","dashboardComplaints","الشكاوى","complaints","data","items")
  attachOptional("api/admin/fannis","dashboardTechnicians","fannis","technicians","items","data")
  attachOptional("api/admin/fanni-profile-edits","dashboardProfileEdits","requests","edits","items")
  attachOptional("api/admin/client-wallet/topup-requests","dashboardClientTopups","requests","items","data")
  attachOptional("api/password-recovery/admin/requests","dashboardRecoveryRequests","recoveries","items","data")
  root.add("dashboardWarnings",warnings)
  return root
 }
 fun uploadStoreImage(uri:Uri,purpose:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,storeUploadedImageUrl=null,storeUploadedImageFileId=null)
  try{
   val result=repo.uploadStoreMedia(uri,purpose)
   val url=result.takeIf{it.isJsonObject}?.asJsonObject?.get("imageUrl")?.takeIf{!it.isJsonNull}?.asString
    ?:error("الخادم لم يُرجع رابط الصورة")
   val id=result.asJsonObject.get("imageFileId")?.takeIf{!it.isJsonNull}?.asString
    ?:error("الخادم لم يُرجع معرّف الصورة")
   _state.value=_state.value.copy(busy=false,storeUploadedImageUrl=url,storeUploadedImageFileId=id,actionMessage="تم رفع الصورة إلى تخزين المتجر")
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر رفع صورة المتجر")}
 }
 fun clearStoreUpload(){_state.value=_state.value.copy(storeUploadedImageUrl=null,storeUploadedImageFileId=null)}
 fun refresh()=load(AdminSection.DASHBOARD)
 private fun refreshDashboardSnapshot()=viewModelScope.launch{runCatching{enrichDashboard(repo.get(AdminSection.DASHBOARD))}.onSuccess{snapshot->_state.value=_state.value.copy(stats=snapshot)}}
 fun open(section:AdminSection){_state.value=_state.value.copy(sectionSearch="");if(section==AdminSection.UI_LAYOUT)loadUiLayout("admin")else load(section)}
 fun loadUiLayout(page:String)=viewModelScope.launch{
  val safePage=page.takeIf{it in listOf("admin","client","fanni","password","support")}?: "admin"
  _state.value=_state.value.copy(section=AdminSection.UI_LAYOUT,uiLayoutPage=safePage,busy=true,error=null,payload=null)
  try{val data=repo.get("api/admin/ui-layout/$safePage");_state.value=_state.value.copy(busy=false,payload=data)}
  catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل تخطيط الصفحة")}
 }
 fun filterPageVisits(pageKey:String)=viewModelScope.launch{
  val clean=pageKey.trim()
  _state.value=_state.value.copy(section=AdminSection.PAGE_VISITS,busy=false,error=null,actionMessage="جاري تحميل سجل الزيارات للصفحة المحددة...")
  try{
   val path="api/admin/page-visits"+if(clean.isBlank())"" else "?pageKey="+Uri.encode(clean)
   val data=repo.get(path)
   _state.value=_state.value.copy(busy=false,payload=data,actionMessage=if(clean.isBlank())"عرض كل صفحات الموقع" else "تم تطبيق فلتر الصفحة: $clean")
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تصفية سجل الزيارات")}
 }
 fun openClientOrders(phone:String){_state.value=_state.value.copy(sectionSearch=phone.trim());load(AdminSection.ORDERS)}
 fun searchClients(query:String)=viewModelScope.launch{
  val clean=query.trim()
  if(clean.length<2){load(AdminSection.CLIENTS);return@launch}
  _state.value=_state.value.copy(section=AdminSection.CLIENTS,busy=true,error=null,sectionSearch=clean)
  try{
   val data=repo.get("api/admin/clients?search="+Uri.encode(clean))
   val rows=AdminSection.CLIENTS.extract(data)
   _state.value=_state.value.copy(busy=false,items=rows,payload=data)
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر البحث عن العملاء")}
 }
 private fun load(section:AdminSection,preserveMessage:Boolean=false)=viewModelScope.launch{
  _state.value=_state.value.copy(section=section,busy=true,error=null,items=emptyList(),actionMessage=if(preserveMessage)_state.value.actionMessage else null)
  try{
   val response=repo.get(section)
   val data=when(section){
    AdminSection.DASHBOARD,AdminSection.STATS->enrichDashboard(response)
    AdminSection.STORE_PRODUCTS->enrichStoreProducts(response)
    AdminSection.STORE_ORDERS->enrichStoreOrders(response)
    else->response
   }
   val loaded=section.extract(data)
   val supportCases=if(section==AdminSection.SUPPORT)runCatching{repo.get("api/support/admin").asJsonObject.get("supportCases")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it}?:emptyList()}.getOrDefault(emptyList()) else _state.value.supportCases
   val supportViolations=if(section==AdminSection.SUPPORT)loaded else _state.value.supportViolations
   val inboxResult=if(section==AdminSection.NOTIFICATIONS)runCatching{repo.get("api/notifications/admin")}else null
   val deliveryResult=if(section==AdminSection.NOTIFICATIONS)runCatching{repo.get("api/notifications/admin/delivery-log")}else null
   val adminInbox=inboxResult?.getOrNull()?.takeIf{it.isJsonObject}?.asJsonObject?.get("notifications")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it}?:if(section==AdminSection.NOTIFICATIONS)emptyList() else _state.value.adminInbox
   val adminUnreadCount=inboxResult?.getOrNull()?.takeIf{it.isJsonObject}?.asJsonObject?.get("unreadCount")?.takeIf{it.isJsonPrimitive}?.asInt?:if(section==AdminSection.NOTIFICATIONS)0 else _state.value.adminUnreadCount
   val notificationDeliveries=deliveryResult?.getOrNull()?.takeIf{it.isJsonObject}?.asJsonObject?.get("deliveries")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it}?:if(section==AdminSection.NOTIFICATIONS)emptyList() else _state.value.notificationDeliveries
   val adminNotificationError=if(section==AdminSection.NOTIFICATIONS)listOfNotNull(inboxResult?.exceptionOrNull()?.message,deliveryResult?.exceptionOrNull()?.message).takeIf{it.isNotEmpty()}?.joinToString(" • ") else _state.value.adminNotificationError
   val visible=when(section){AdminSection.PENDING->loaded.filter{it.isJsonObject&&it.asJsonObject.get("isApproved")?.asBoolean!=true&&it.asJsonObject.get("isDisabled")?.asBoolean!=true&&it.asJsonObject.get("status")?.asString!="rejected"};AdminSection.DISABLED->loaded.filter{it.isJsonObject&&(it.asJsonObject.get("isDisabled")?.asBoolean==true||it.asJsonObject.get("status")?.asString=="disabled")};AdminSection.OFFERS->loaded.filter{it.isJsonObject&&it.asJsonObject.get("offers")?.let{v->v.isJsonArray&&v.asJsonArray.size()>0}==true};else->loaded}
   _state.value=_state.value.copy(busy=false,stats=if(section==AdminSection.DASHBOARD||section==AdminSection.STATS)data else _state.value.stats,items=visible,payload=data,supportCases=supportCases,supportViolations=supportViolations,supportSearchResults=if(section==AdminSection.SUPPORT)emptyList() else _state.value.supportSearchResults,supportSelectedCase=if(section==AdminSection.SUPPORT)null else _state.value.supportSelectedCase,adminInbox=adminInbox,adminUnreadCount=adminUnreadCount,notificationDeliveries=notificationDeliveries,adminNotificationError=adminNotificationError)
  }
  catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل البيانات")}
 }
 fun mutate(method:String,path:String,body:JsonObject=JsonObject())=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,actionMessage=null)
  try{
   val result=repo.mutate(method,path,body)
   val response=result.takeIf{it.isJsonObject}?.asJsonObject
   val serverMessage=response?.get("message")?.takeIf{!it.isJsonNull}?.asString
   val actionMessage=if(path=="api/admin/store/products/import"){
    val summary="تم الاستيراد: "+(response?.get("importedCount")?.toString()?: "0")+" منتج • المكرر والمتخطى: "+(response?.get("duplicateCount")?.toString()?: "0")+" • الصفوف المرفوضة: "+(response?.get("errorCount")?.toString()?: "0")
    val details=mutableListOf<String>()
    listOf("duplicates" to "مكرر","errors" to "خطأ").forEach{(key,label)->
     response?.get(key)?.takeIf{it.isJsonArray}?.asJsonArray?.forEach{entry->
      if(details.size<8&&entry.isJsonObject){
       val item=entry.asJsonObject
       val row=item.get("rowNumber")?.takeIf{!it.isJsonNull}?.toString()?.trim('"')?: "?"
       val name=item.get("name")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
       val message=item.get("message")?.takeIf{!it.isJsonNull}?.asString?:label
       details.add("الصف $row • $name: $message")
      }
     }
    }
    summary+if(details.isEmpty())"" else "\n"+details.joinToString("\n")
   }else serverMessage?:result.toString()
   refreshDashboardSnapshot()
   if(_state.value.section==AdminSection.REPORTS)_state.value=_state.value.copy(busy=false,payload=result,actionMessage=actionMessage)
   else if(_state.value.section==AdminSection.UI_LAYOUT){_state.value=_state.value.copy(busy=false,actionMessage=actionMessage);loadUiLayout(_state.value.uiLayoutPage)}
   else{_state.value=_state.value.copy(busy=false,actionMessage=actionMessage);load(_state.value.section,true)}
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تنفيذ العملية")}
 }
 fun openFanniIdentity(id:String)=viewModelScope.launch{
  _state.value.identityFrontPath?.let{java.io.File(it).delete()}
  _state.value.identityBackPath?.let{java.io.File(it).delete()}
  _state.value=_state.value.copy(busy=true,error=null,identityFanniId=id,identityFrontPath=null,identityBackPath=null)
  try{
   val front=repo.downloadFanniIdentity(id,"front")
   val back=try{repo.downloadFanniIdentity(id,"back")}catch(e:Exception){front.delete();throw e}
   _state.value=_state.value.copy(busy=false,identityFrontPath=front.absolutePath,identityBackPath=back.absolutePath)
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل صور بطاقة الفني")}
 }
 fun closeFanniIdentity(){
  _state.value.identityFrontPath?.let{java.io.File(it).delete()}
  _state.value.identityBackPath?.let{java.io.File(it).delete()}
  _state.value=_state.value.copy(identityFanniId=null,identityFrontPath=null,identityBackPath=null)
 }
 fun openFanniProfile(id:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,editingProfile=null,editingProfileId=null)
  try{
   val data=repo.get("api/admin/fannis/$id/profile")
   val servicesResponse=repo.get("api/admin/services")
   val regionsResponse=repo.get("api/admin/regions")
   val serviceOptions=servicesResponse.takeIf{it.isJsonObject}?.asJsonObject?.get("services")?.takeIf{it.isJsonArray}?.asJsonArray
   val areaOptions=regionsResponse.takeIf{it.isJsonObject}?.asJsonObject?.get("regions")?.takeIf{it.isJsonArray}?.asJsonArray
   if(data.isJsonObject){
    val root=data.asJsonObject
    root.add("serviceOptions",com.google.gson.JsonArray().apply{
     serviceOptions?.forEach{entry->val name=if(entry.isJsonObject)entry.asJsonObject.get("name")?.asString else entry.takeIf{it.isJsonPrimitive}?.asString;if(!name.isNullOrBlank())add(name)}
    })
    root.add("areaOptions",com.google.gson.JsonArray().apply{
     areaOptions?.forEach{entry->if(entry.isJsonObject){val o=entry.asJsonObject;val name=o.get("name")?.asString;if(!name.isNullOrBlank()&&o.get("isActive")?.asBoolean!=false&&o.get("isDeleted")?.asBoolean!=true)add(name)}}
    })
    val fanni=root.get("fanni")?.takeIf{it.isJsonObject}?.asJsonObject
    val selectedServices=fanni?.get("specialties")?.takeIf{it.isJsonArray}?.asJsonArray
    val selectedAreas=fanni?.get("areas")?.takeIf{it.isJsonArray}?.asJsonArray
    selectedServices?.forEach{root.getAsJsonArray("serviceOptions").add(it)}
    selectedAreas?.forEach{root.getAsJsonArray("areaOptions").add(it)}
   }
   _state.value=_state.value.copy(busy=false,editingProfile=data,editingProfileId=id)
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل بيانات الفني")}
 }
 fun saveEditedProfile(method:String,path:String,body:JsonObject)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,actionMessage=null)
  try{
   val result=repo.mutate(method,path,body)
   val message=result.takeIf{it.isJsonObject}?.asJsonObject?.get("message")?.takeIf{!it.isJsonNull}?.asString?: "تم حفظ البيانات بنجاح"
   _state.value=_state.value.copy(busy=false,editingProfile=null,editingProfileId=null,editingClient=null,editingClientId=null,actionMessage=message)
   load(_state.value.section,true)
  }catch(e:Exception){
   _state.value=_state.value.copy(busy=false,error=null,actionMessage=e.message?: "تعذر حفظ التعديلات")
  }
 }
 fun closeProfile(){_state.value=_state.value.copy(editingProfile=null,editingProfileId=null)}
 fun openRecovery(id:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,recoveryDetail=null,recoveryDetailId=id)
  try{val data=repo.get("api/password-recovery/admin/requests/$id");_state.value=_state.value.copy(busy=false,recoveryDetail=data)}
  catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل محادثة الاستعادة")}
 }
 fun closeRecovery(){_state.value=_state.value.copy(recoveryDetail=null,recoveryDetailId=null)}
 fun recoveryAction(method:String,path:String,body:JsonObject=JsonObject())=viewModelScope.launch{
  val id=_state.value.recoveryDetailId?:return@launch
  _state.value=_state.value.copy(busy=true,error=null,actionMessage=null)
  try{
   val result=repo.mutate(method,path,body)
   val detail=repo.get("api/password-recovery/admin/requests/$id")
   val obj=result.takeIf{it.isJsonObject}?.asJsonObject
   val message=obj?.get("message")?.asString?: "تم تنفيذ الإجراء"
   val code=obj?.get("code")?.takeIf{!it.isJsonNull}?.asString
   _state.value=_state.value.copy(busy=false,recoveryDetail=detail,actionMessage=message+(code?.let{" — رمز الاستعادة: $it"}?:""))
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تنفيذ إجراء الاستعادة")}
 }

 fun openClientProfile(id:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,editingClient=null,editingClientId=null)
  try{val data=repo.get("api/admin/client-accounts/$id/profile");_state.value=_state.value.copy(busy=false,editingClient=data,editingClientId=id)}
  catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل بيانات العميل")}
 }
 fun closeClientProfile(){_state.value=_state.value.copy(editingClient=null,editingClientId=null)}
 fun openWalletTransactions(id:String)=viewModelScope.launch{_state.value=_state.value.copy(busy=true,error=null,walletFanniId=id);try{val data=repo.get("api/admin/wallet/transactions/$id");val rows=if(data.isJsonObject)data.asJsonObject.get("transactions")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it}?:emptyList() else emptyList();_state.value=_state.value.copy(busy=false,walletTransactions=rows)}catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل حركات المحفظة")}}
 fun openClientWalletTransactions(id:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,walletFanniId=id,walletTransactions=emptyList())
  try{
   val data=repo.get("api/admin/client-wallet/transactions/$id")
   val rows=if(data.isJsonObject)data.asJsonObject.get("transactions")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it}?:emptyList() else emptyList()
   _state.value=_state.value.copy(busy=false,walletTransactions=rows)
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل حركات محفظة العميل")}
 }
 fun closeWalletTransactions(){_state.value=_state.value.copy(walletFanniId=null,walletTransactions=emptyList())}
 fun issueSupportPassword(role:String,id:String)=viewModelScope.launch{
  if(role !in listOf("client","fanni")){_state.value=_state.value.copy(error="نوع الحساب غير صالح");return@launch}
  _state.value=_state.value.copy(busy=true,error=null,supportPasswordText=null)
  try{
   val result=repo.mutate("POST","api/password-recovery/admin/support-passwords",JsonObject().apply{addProperty("role",role);addProperty("accountId",id)})
   val secret=result.takeIf{it.isJsonObject}?.asJsonObject?.get("supportPassword")?.takeIf{!it.isJsonNull}?.asString
    ?:result.takeIf{it.isJsonObject}?.asJsonObject?.get("data")?.takeIf{it.isJsonObject}?.asJsonObject?.get("supportPassword")?.takeIf{!it.isJsonNull}?.asString
   if(secret.isNullOrBlank())error("لم يستلم التطبيق كلمة الدعم من الخادم")
   _state.value=_state.value.copy(busy=false,supportPasswordText=secret,supportPasswordTitle=if(role=="client")"كلمة دعم جديدة للعميل" else "كلمة دعم جديدة للفني")
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر إصدار كلمة الدعم")}
 }
 fun revealSupportPassword(role:String,id:String)=viewModelScope.launch{
  if(role !in listOf("client","fanni")){_state.value=_state.value.copy(error="نوع الحساب غير صالح");return@launch}
  _state.value=_state.value.copy(busy=true,error=null,supportPasswordText=null)
  try{
   val active=repo.get("api/password-recovery/admin/support-passwords?role=$role&accountId=$id")
   val supportId=active.takeIf{it.isJsonObject}?.asJsonObject?.get("id")?.takeIf{!it.isJsonNull}?.asString
    ?:error("لا توجد كلمة دعم صالحة لهذا الحساب")
   val result=repo.get("api/password-recovery/admin/support-passwords/$supportId/reveal")
   val secret=result.takeIf{it.isJsonObject}?.asJsonObject?.get("supportPassword")?.takeIf{!it.isJsonNull}?.asString
    ?:result.takeIf{it.isJsonObject}?.asJsonObject?.get("data")?.takeIf{it.isJsonObject}?.asJsonObject?.get("supportPassword")?.takeIf{!it.isJsonNull}?.asString
   if(secret.isNullOrBlank())error("تعذر استرجاع كلمة الدعم")
   _state.value=_state.value.copy(busy=false,supportPasswordText=secret,supportPasswordTitle=if(role=="client")"كلمة الدعم الحالية للعميل" else "كلمة الدعم الحالية للفني")
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر عرض كلمة الدعم")}
 }
 fun issueClientSupportPassword(id:String)=issueSupportPassword("client",id)
 fun revealClientSupportPassword(id:String)=revealSupportPassword("client",id)
 fun closeSupportPassword(){_state.value=_state.value.copy(supportPasswordText=null)}
 fun markAdminNotificationRead(id:String)=mutate("PATCH","api/notifications/admin/$id/read")
 fun markAllAdminNotificationsRead()=mutate("PATCH","api/notifications/admin/read-all")
 fun openSupportCase(id:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null)
  try{
   val data=repo.get("api/support/admin/$id")
   val item=data.takeIf{it.isJsonObject}?.asJsonObject?.get("supportCase")
   _state.value=_state.value.copy(busy=false,supportSelectedCase=item)
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل محادثة الدعم")}
 }
 fun supportAction(method:String,path:String,body:JsonObject=JsonObject())=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null,actionMessage=null)
  try{
   val result=repo.mutate(method,path,body)
   val updated=result.takeIf{it.isJsonObject}?.asJsonObject?.get("supportCase")
   val id=_state.value.supportSelectedCase?.takeIf{it.isJsonObject}?.asJsonObject?.get("_id")?.asString
   val detail=if(updated!=null)updated else if(!id.isNullOrBlank())repo.get("api/support/admin/$id").asJsonObject.get("supportCase") else null
   _state.value=_state.value.copy(busy=false,supportSelectedCase=detail,actionMessage=result.takeIf{it.isJsonObject}?.asJsonObject?.get("message")?.asString?: "تم تنفيذ الإجراء")
   val list=repo.get("api/support/admin").asJsonObject.get("supportCases")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it}?:emptyList()
   _state.value=_state.value.copy(supportCases=list)
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تنفيذ إجراء الدعم")}
 }
 fun searchSupport(query:String)=viewModelScope.launch{
  if(query.trim().length<2){_state.value=_state.value.copy(error="اكتب رقم طلب أو هاتفًا من حرفين على الأقل");return@launch}
  _state.value=_state.value.copy(busy=true,error=null,section=AdminSection.SUPPORT)
  try{
   val data=repo.get("api/admin/support/search?q="+Uri.encode(query.trim()))
   val obj=data.asJsonObject
   val rows=mutableListOf<JsonElement>()
   listOf("orders","complaints").forEach{key->obj.get(key)?.takeIf{it.isJsonArray}?.asJsonArray?.forEach{entry->rows.add(entry)}}
   _state.value=_state.value.copy(busy=false,supportSearchResults=rows,payload=data)
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر البحث في أدوات الدعم")}
 }
 fun filterAuditLogs(date:String)=viewModelScope.launch{
  _state.value=_state.value.copy(busy=true,error=null)
  try{
   val clean=date.trim()
   val path="api/admin/audit-logs"+if(clean.isBlank())"" else "?date="+Uri.encode(clean)
   val data=repo.get(path)
   val rows=if(data.isJsonObject)data.asJsonObject.get("logs")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it} ?: data.asJsonObject.get("items")?.takeIf{it.isJsonArray}?.asJsonArray?.map{it} ?: emptyList() else emptyList()
   _state.value=_state.value.copy(busy=false,section=AdminSection.SECURITY,items=rows,payload=data,actionMessage=if(clean.isBlank())"تم تحديث سجل التدقيق" else "تم تطبيق فلتر التاريخ: $clean")
  }catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تصفية سجل التدقيق")}
 }
 fun bulkAction(section:AdminSection,ids:List<String>,action:String,reason:String="إجراء جماعي موثق من تطبيق الإدارة")=viewModelScope.launch{
  if(ids.isEmpty())return@launch
  if(ids.size>100){_state.value=_state.value.copy(actionMessage="الحد الأقصى للإجراء الجماعي 100 عنصر");return@launch}
  _state.value=_state.value.copy(busy=true,error=null,actionMessage=null)
  var succeeded=0
  var failed=0
  val errors=mutableListOf<String>()
  for(raw in ids.distinct()){
   try{
    when(section){
     AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED->{
      if(action=="freeze"||action=="unfreeze")repo.mutate("POST","api/admin/wallet/freeze/$raw",JsonObject().apply{addProperty("action",action);addProperty("reason",reason)})
      else{
       val method=if(action=="delete")"DELETE" else "POST"
       val body=JsonObject().apply{if(action in listOf("reject","disable"))addProperty("reason",reason)}
       repo.mutate(method,"api/admin/fannis/$raw"+if(action=="delete")"" else "/$action",body)
      }
     }
     AdminSection.WALLETS->repo.mutate("POST","api/admin/wallet/freeze/$raw",JsonObject().apply{addProperty("action",action);addProperty("reason",reason)})
     AdminSection.CLIENTS->{
      if(action!="delete")error("الإجراء الجماعي المتاح للعملاء هو حذف الحساب فقط")
      repo.mutate("DELETE","api/admin/clients/${Uri.encode(raw)}/account")
     }
     AdminSection.TOPUPS->repo.mutate("POST","api/admin/topup-requests/$raw/$action",JsonObject().apply{if(action=="reject")addProperty("reason",reason)})
     AdminSection.COMPLAINTS->repo.mutate("PATCH","api/admin/complaints/$raw",JsonObject().apply{addProperty("status",action)})
     AdminSection.OFFERS->{
      val parts=raw.split("|")
      if(parts.size!=2)error("معرّف العرض غير صالح")
      repo.mutate("POST","api/admin/offers/"+parts[0]+"/"+parts[1]+"/reject",JsonObject().apply{addProperty("reason",reason)})
     }
     AdminSection.REGIONS->when(action){
      "delete"->repo.mutate("DELETE","api/admin/regions/$raw")
      "restore"->repo.mutate("PATCH","api/admin/regions/$raw",JsonObject().apply{addProperty("isDeleted",false)})
      "activate"->repo.mutate("PATCH","api/admin/regions/$raw",JsonObject().apply{addProperty("isActive",true)})
      else->repo.mutate("PATCH","api/admin/regions/$raw",JsonObject().apply{addProperty("isActive",false)})
     }
     else->error("الإجراء الجماعي غير متاح لهذا القسم")
    }
    succeeded++
   }catch(e:Exception){failed++;if(errors.size<3)errors.add(raw+": "+(e.message?: "تعذر التنفيذ"))}
  }
  _state.value=_state.value.copy(busy=false,actionMessage="نجح $succeeded — تعذر $failed"+if(errors.isEmpty())"" else " — "+errors.joinToString(" | "))
  load(_state.value.section,true)
 }
 fun bulkRenameRegions(names:Map<String,String>)=viewModelScope.launch{
  if(names.isEmpty())return@launch
  if(names.size>100){_state.value=_state.value.copy(actionMessage="الحد الأقصى لتعديل المناطق دفعة واحدة 100 منطقة");return@launch}
  val invalid=names.values.any{it.trim().length !in 2..100}
  if(invalid){_state.value=_state.value.copy(error="تأكد أن كل اسم يتكون من حرفين إلى 100 حرف");return@launch}
  _state.value=_state.value.copy(busy=true,error=null,actionMessage=null)
  var succeeded=0
  var failed=0
  val errors=mutableListOf<String>()
  for((id,rawName) in names){
   try{
    repo.mutate("PATCH","api/admin/regions/$id",JsonObject().apply{addProperty("name",rawName.trim().replace(Regex("\\s+")," "))})
    succeeded++
   }catch(e:Exception){failed++;if(errors.size<3)errors.add("$rawName: "+(e.message?: "تعذر التعديل"))}
  }
  _state.value=_state.value.copy(busy=false,actionMessage="تم تعديل $succeeded منطقة، وتعذر تعديل $failed"+if(errors.isEmpty())"" else " — "+errors.joinToString(" | "))
  load(AdminSection.REGIONS,true)
 }
 fun bulkPublish(sns:List<String>)=viewModelScope.launch{
  if(sns.isEmpty())return@launch
  if(sns.size>100){_state.value=_state.value.copy(actionMessage="الحد الأقصى للنشر الجماعي 100 طلب");return@launch}
  _state.value=_state.value.copy(busy=true,error=null,actionMessage=null)
  var published=0
  var failed=0
  val errors=mutableListOf<String>()
  for(sn in sns.distinct()){
   try{repo.mutate("POST","api/orders/admin/$sn/publish",JsonObject());published++}
   catch(e:Exception){failed++;if(errors.size<3)errors.add("$sn: "+(e.message?: "تعذر النشر"))}
  }
  _state.value=_state.value.copy(busy=false,actionMessage="تم نشر $published طلب، وتعذر نشر $failed"+if(errors.isEmpty())"" else " — "+errors.joinToString(" | "))
  load(_state.value.section,true)
 }
 fun loadVoice(sn:String)=viewModelScope.launch{_state.value=_state.value.copy(busy=true,error=null);try{val file=repo.downloadVoice(sn);_state.value=_state.value.copy(busy=false,voicePath=file.absolutePath)}catch(e:Exception){_state.value=_state.value.copy(busy=false,error=e.message?: "تعذر تحميل التسجيل الصوتي")}}
 fun retry(){if(_state.value.section==AdminSection.DASHBOARD)load(AdminSection.DASHBOARD)else{refreshDashboardSnapshot();if(_state.value.section==AdminSection.UI_LAYOUT)loadUiLayout(_state.value.uiLayoutPage)else load(_state.value.section)}}
 fun logout()=viewModelScope.launch{repo.logout();_state.value=AdminUiState(checking=false)}
 fun registerFcm(token:String)=viewModelScope.launch{runCatching{repo.registerFcm(token)}}
}
