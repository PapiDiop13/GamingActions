import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, Dimensions, ScrollView } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLORS } from '../constants/colors';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_PADDING = 16;
const CARD_H_MAX = SH * 0.92;
const BTN_H = 52;      // paddingVertical 14 * 2 + fontSize ~24
const INNER_W = SW - 48 - CARD_PADDING * 2; // backdrop padding 24*2, card padding 16*2

export default function AnnouncementOverlay() {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState(null);
  // aspect ratio de l'image (largeur / hauteur), défaut 16:9
  const [imgAspect, setImgAspect] = useState(16 / 9);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => { checkAnnouncement(); }, []);

  const checkAnnouncement = async () => {
    try {
      const snap = await getDoc(doc(db, 'app_config', 'announcement'));
      if (snap.exists()) {
        const d = snap.data();
        if (d.active) {
          setData(d);
          if (d.imageUrl) {
            Image.getSize(
              d.imageUrl,
              (w, h) => {
                setImgAspect(w / h);
                setImgReady(true);
                setVisible(true);
              },
              () => {
                setImgAspect(16 / 9);
                setImgReady(true);
                setVisible(true);
              }
            );
          } else {
            setVisible(true);
          }
        }
      }
    } catch(e) {}
  };

  if (!visible || !data) return null;

  // Hauteur max disponible pour l'image : card max - paddings - bouton - marges
  const maxImgH = CARD_H_MAX - CARD_PADDING * 2 - BTN_H - 16 - (data.title ? 40 : 0) - (data.message ? 50 : 0) - 16;
  // Hauteur naturelle de l'image à la largeur disponible
  const naturalH = INNER_W / imgAspect;
  const imgH = Math.min(naturalH, maxImgH, SH * 0.68);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
            bounces={false}
          >
            {data.imageUrl && imgReady ? (
              <Image
                source={{ uri: data.imageUrl }}
                style={{ width: INNER_W, height: imgH, borderRadius: 12, marginBottom: 14, alignSelf: 'center' }}
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: CARD_PADDING, width: '100%', maxHeight: CARD_H_MAX, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 10 },
  message: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  btn: { backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
});
