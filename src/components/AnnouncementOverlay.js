import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, Dimensions, ScrollView } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLORS } from '../constants/colors';

const { width: SW, height: SH } = Dimensions.get('window');
const IMG_W = SW - 24 * 2 - 20 * 2; // largeur dispo dans la card

export default function AnnouncementOverlay() {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState(null);
  const [imgSize, setImgSize] = useState({ width: IMG_W, height: 180 });

  useEffect(() => { checkAnnouncement(); }, []);

  const checkAnnouncement = async () => {
    try {
      const snap = await getDoc(doc(db, 'app_config', 'announcement'));
      if (snap.exists()) {
        const d = snap.data();
        if (d.active) {
          setData(d);
          setVisible(true);
          // Récupère les dimensions réelles de l'image pour adapter le ratio
          if (d.imageUrl) {
            Image.getSize(
              d.imageUrl,
              (w, h) => {
                const ratio = h / w;
                const displayW = IMG_W;
                const displayH = Math.min(displayW * ratio, SH * 0.45); // max 45% écran
                setImgSize({ width: displayW, height: displayH });
              },
              () => {} // fallback: garde 180px
            );
          }
        }
      }
    } catch(e){}
  };

  if (!visible || !data) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
            {data.imageUrl ? (
              <Image
                source={{ uri: data.imageUrl }}
                style={[s.image, { width: imgSize.width, height: imgSize.height }]}
                resizeMode="cover"
              />
            ) : null}
            {data.title ? <Text style={s.title}>{data.title}</Text> : null}
            {data.message ? <Text style={s.message}>{data.message}</Text> : null}
          </ScrollView>
          <TouchableOpacity onPress={() => setVisible(false)} style={s.btn}>
            <Text style={s.btnText}>{data.buttonText || 'OK 👍'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 20, width: '100%', maxHeight: SH * 0.82, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  image: { borderRadius: 12, marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 10 },
  message: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  btn: { backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
});
