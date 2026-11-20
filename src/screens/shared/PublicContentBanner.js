import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';

export default function PublicContentBanner() {
  const [content, setContent] = useState({ maintenance: false, maintenanceMessage: '', announcement: '', faqs: [] });

  useEffect(() => {
    let active = true;
    api('/content').then(result => {
      if (!active) return;
      setContent({
        maintenance: Boolean(result.maintenance),
        maintenanceMessage: String(result.maintenanceMessage || ''),
        announcement: String(result.announcement || ''),
        faqs: Array.isArray(result.faqs) ? result.faqs : []
      });
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const hasVisibleContent = content.maintenance || content.announcement.trim() || content.faqs.length;
  if (!hasVisibleContent) return null;
  return (
    <View style={{ marginHorizontal: 14, marginTop: 8, gap: 8 }}>
      {content.maintenance ? <View style={[styles.dataCard, { backgroundColor: '#FFFAEA', borderColor: '#F9DF91' }]}><Text style={{ color: '#704900', fontSize: 12, fontWeight: '900' }}>النظام في وضع الصيانة: {content.maintenanceMessage || 'الخدمة متوقفة مؤقتًا. حاول لاحقًا.'}</Text></View> : null}
      {content.announcement.trim() ? <View style={[styles.dataCard, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}><Text style={{ color: COLORS.navy, fontSize: 12, fontWeight: '800', lineHeight: 21 }}>{content.announcement}</Text></View> : null}
      {content.faqs.length ? <View style={styles.dataCard}><Text style={styles.cardTitleSmall}>الأسئلة الشائعة</Text>{content.faqs.map((item, index) => <View key={String(item._id || index)} style={{ paddingTop: 9, marginTop: 9, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}><Text style={styles.detailBold}>{item.question || ''}</Text><Text style={styles.detail}>{item.answer || ''}</Text></View>)}</View> : null}
    </View>
  );
}
