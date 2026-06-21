import React, { useState, useEffect, useRef } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Platform, Alert, Image, Switch, RefreshControl, KeyboardAvoidingView,
  Modal, ActivityIndicator, Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, orderBy, getDocs, doc, getDoc, setDoc, updateDoc,
  addDoc, serverTimestamp, limit, where, deleteDoc, startAfter, increment,
} from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import { GAMES } from '../../constants/games';

const HARDCODED_ADMINS = [
  'admin@gamingactions.com',
  'pdiop08@outlook.fr',
  'free08man@gmail.com',
];

const TABS = [
  { id: 'overview', label: 'Stats', icon: 'bar-chart' },
  { id: 'reports', label: 'Reports', icon: 'flag' },
  { id: 'videos', label: 'Videos', icon: 'videocam' },
  { id: 'creators', label: 'Creators', icon: 'rocket' },
  { id: 'moderation', label: 'Mod', icon: 'shield-checkmark' },
  { id: 'top10', label: 'Top 10', icon: 'trophy' },
  { id: 'fraud', label: 'Fraude', icon: 'warning' },
  { id: 'users', label: 'Users', icon: 'people' },
  { id: 'announce', label: 'Annonce', icon: 'megaphone' },
  { id: 'games', label: 'Jeux', icon: 'game-controller' },
  { id: 'notifs', label: 'Notifs', icon: 'notifications' },
  { id: 'access', label: 'Acces', icon: 'key' },
  { id: 'errors', label: 'Errors', icon: 'bug' },
];

// Lecteur vidéo minimal pour la galerie admin — charge uniquement quand monté
function AdminVideoPlayer({ videoUrl, height = 180 }) {
  const player = useVideoPlayer(videoUrl || null, (p) => {
    p.loop = true;
    p.muted = false;
  });
  if (!videoUrl) return (
    <View style={{ width: '100%', height, borderRadius: 12, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
      <Ionicons name="videocam-off" size={32} color="#444" />
      <Text style={{ color: '#444', fontSize: 11, marginTop: 6 }}>No video URL</Text>
    </View>
  );
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height, borderRadius: 12, marginBottom: 12, backgroundColor: '#000' }}
      contentFit="cover"
      nativeControls={true}
    />
  );
}

export default function AdminScreen({ navigation, route }) {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // OVERVIEW
  const [stats, setStats] = useState({});
  const loadOverview = async () => {
    setLoading(true);
    try {
      const [uS,vS,gS,fS,nS,rS] = await Promise.all([
        getDocs(collection(db,'users')),getDocs(collection(db,'videos')),getDocs(collection(db,'ggs')),
        getDocs(collection(db,'follows')),getDocs(collection(db,'notifications')),
        getDocs(query(collection(db,'reports'),where('status','==','pending'))),
      ]);
      const totalGG = vS.docs.reduce((s,d) => s + (d.data().ggCount||0), 0);
      setStats({
        users:uS.size, videos:vS.size, ggs:gS.size, totalGG,
        follows:fS.size, notifs:nS.size, pendingReports: rS.size,
        creators: uS.docs.filter(d=>['creator','gameconic'].includes(d.data().accountType)).length,
        legendary: uS.docs.filter(d=>d.data().plan==='legendary').length,
        banned: uS.docs.filter(d=>d.data().banned).length,
        restricted: vS.docs.filter(d=>d.data().restricted).length,
      });
    } catch(e){}
    setLoading(false);
  };

  // REPORTS
  const [reports, setReports] = useState([]);
  const loadReports = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'reports'),orderBy('createdAt','desc'),limit(30)));
      const list = [];
      for (const d of snap.docs) {
        const r = { id: d.id, ...d.data() };
        // Enrichir avec les infos de la cible
        if (r.targetId && r.targetType === 'video') {
          try {
            const vSnap = await getDoc(doc(db,'videos',r.targetId));
            if (vSnap.exists()) r.targetData = vSnap.data();
          } catch(e){}
        }
        if (r.targetId && r.targetType === 'profile') {
          try {
            const uSnap = await getDoc(doc(db,'users',r.targetId));
            if (uSnap.exists()) r.targetData = uSnap.data();
          } catch(e){}
        }
        list.push(r);
      }
      setReports(list);
    } catch(e){}
    setLoading(false);
  };

  const restrictVideo = async (report) => {
    Alert.alert('Masquer cette video ?','Elle affichera "Video under restriction" et sera invisible dans les feeds.',[
      {text:'Annuler',style:'cancel'},
      {text:'Masquer',style:'destructive',onPress:async()=>{
        await updateDoc(doc(db,'videos',report.targetId),{restricted:true,restrictedAt:serverTimestamp(),restrictedReason:report.reason});
        await updateDoc(doc(db,'reports',report.id),{status:'resolved',resolvedAction:'restricted',resolvedAt:serverTimestamp()});
        setReports(prev=>prev.map(r=>r.id===report.id?{...r,status:'resolved'}:r));
        Alert.alert('Video masquee','Elle ne sera plus visible dans les feeds.');
      }},
    ]);
  };

  const unrestrictVideo = async (videoId) => {
    await updateDoc(doc(db,'videos',videoId),{restricted:false});
    Alert.alert('Video restauree');
    loadReports();
  };

  const banFromReport = async (report) => {
    const userId = report.targetType === 'video' ? report.targetData?.userId : report.targetId;
    if (!userId) return Alert.alert('Erreur','User ID introuvable');
    const uSnap = await getDoc(doc(db,'users',userId));
    const username = uSnap.exists() ? uSnap.data().username : userId;
    Alert.alert('Ban '+username+' ?','Ce user ne pourra plus utiliser l\'app.',[
      {text:'Annuler',style:'cancel'},
      {text:'Ban',style:'destructive',onPress:async()=>{
        await updateDoc(doc(db,'users',userId),{banned:true,bannedAt:serverTimestamp(),bannedReason:report.reason});
        await updateDoc(doc(db,'reports',report.id),{status:'resolved',resolvedAction:'banned',resolvedAt:serverTimestamp()});
        setReports(prev=>prev.map(r=>r.id===report.id?{...r,status:'resolved'}:r));
        Alert.alert('User banni');
      }},
    ]);
  };

  const resolveReport = async (report) => {
    await updateDoc(doc(db,'reports',report.id),{status:'resolved',resolvedAction:'dismissed',resolvedAt:serverTimestamp()});
    setReports(prev=>prev.map(r=>r.id===report.id?{...r,status:'resolved'}:r));
  };

  // CREATOR REQUESTS
  const [creatorReqs, setCreatorReqs] = useState([]);
  const loadCreatorReqs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'creator_requests'),orderBy('createdAt','desc'),limit(50)));
      setCreatorReqs(snap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){}
    setLoading(false);
  };

  const approveCreator = async (req) => {
    Alert.alert('Approve '+req.username+' ?','They will become a '+(req.creatorType==='developer'?'Game Developer':'Creator')+'.',[
      {text:'Cancel',style:'cancel'},
      {text:'Approve',onPress:async()=>{
        try {
          await updateDoc(doc(db,'users',req.userId),{accountType:req.creatorType==='developer'?'creator':'creator',plan:'legendary'});
          await updateDoc(doc(db,'creator_requests',req.id),{status:'approved',resolvedAt:serverTimestamp()});
          await addDoc(collection(db,'notifications'),{userId:req.userId,type:'creator_approved',text:'Your Creator request was approved! 🎉 Welcome aboard.',read:false,createdAt:serverTimestamp()});
          setCreatorReqs(prev=>prev.map(r=>r.id===req.id?{...r,status:'approved'}:r));
          Alert.alert('Approved','『'+req.username+'』 is now a Creator.');
        } catch(e){Alert.alert('Error',e.message);}
      }},
    ]);
  };

  const declineCreator = async (req) => {
    Alert.alert('Decline '+req.username+' ?','',[
      {text:'Cancel',style:'cancel'},
      {text:'Decline',style:'destructive',onPress:async()=>{
        try {
          await updateDoc(doc(db,'creator_requests',req.id),{status:'declined',resolvedAt:serverTimestamp()});
          await addDoc(collection(db,'notifications'),{userId:req.userId,type:'creator_declined',text:'Your Creator request was not approved this time. Keep growing and try again later!',read:false,createdAt:serverTimestamp()});
          setCreatorReqs(prev=>prev.map(r=>r.id===req.id?{...r,status:'declined'}:r));
        } catch(e){Alert.alert('Error',e.message);}
      }},
    ]);
  };

  // MODERATION
  const [modCounters, setModCounters] = useState([]);
  const [bannedWords, setBannedWords] = useState([]);
  const [newBannedWord, setNewBannedWord] = useState('');
  const loadModeration = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'moderation_counters'),orderBy('count','desc'),limit(50)));
      setModCounters(snap.docs.map(d=>({id:d.id,...d.data()})));
      const bw = await getDoc(doc(db,'app_config','banned_words'));
      if(bw.exists()&&Array.isArray(bw.data().words)) setBannedWords(bw.data().words);
    } catch(e){}
    setLoading(false);
  };

  const addBannedWord = async () => {
    const w = newBannedWord.trim().toLowerCase();
    if(!w) return;
    if(bannedWords.includes(w)){ setNewBannedWord(''); return Alert.alert('Exists','This word is already in the list.'); }
    const updated = [...bannedWords, w];
    try {
      await setDoc(doc(db,'app_config','banned_words'),{words:updated,updatedAt:serverTimestamp()},{merge:true});
      setBannedWords(updated); setNewBannedWord('');
    } catch(e){Alert.alert('Error',e.message);}
  };

  const removeBannedWord = async (w) => {
    const updated = bannedWords.filter(x=>x!==w);
    try {
      await setDoc(doc(db,'app_config','banned_words'),{words:updated,updatedAt:serverTimestamp()},{merge:true});
      setBannedWords(updated);
    } catch(e){Alert.alert('Error',e.message);}
  };

  // USERS
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');

  // TOP 10 + FRAUD
  const [allUsers, setAllUsers] = useState([]);
  const [topGGGivers, setTopGGGivers] = useState([]);
  const fmtK = (n) => (n >= 1000 ? `${(n/1000).toFixed(1)}K` : `${n||0}`);

  const loadTop10 = async () => {
    setLoading(true);
    try {
      const uSnap = await getDocs(collection(db,'users'));
      const all = uSnap.docs.map(d=>({id:d.id,...d.data()}));
      setAllUsers(all);
    } catch(e){}
    setLoading(false);
  };

  const loadFraud = async () => {
    setLoading(true);
    try {
      // Charge les users si pas encore fait
      if(allUsers.length===0){
        const uSnap = await getDocs(collection(db,'users'));
        const all = uSnap.docs.map(d=>({id:d.id,...d.data()}));
        setAllUsers(all);
      }
      // Top GG givers (qui donne le plus de GGs — bots potentiels)
      const ggsSnap = await getDocs(collection(db,'ggs'));
      const giverCounts = {};
      ggsSnap.docs.forEach(d=>{
        const uid = d.data().userId;
        if(uid) giverCounts[uid] = (giverCounts[uid]||0)+1;
      });
      const giverList = Object.entries(giverCounts)
        .map(([uid,count])=>({uid,count}))
        .sort((a,b)=>b.count-a.count)
        .slice(0,10);
      // Enrichir avec username
      const enriched = [];
      for(const g of giverList){
        try{
          const uSnap = await getDoc(doc(db,'users',g.uid));
          enriched.push({...g,username:uSnap.exists()?uSnap.data().username:g.uid});
        }catch(e){enriched.push({...g,username:g.uid});}
      }
      setTopGGGivers(enriched);
    } catch(e){}
    setLoading(false);
  };
  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'users'),orderBy('username'),limit(50)));
      setUsers(snap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){}
    setLoading(false);
  };
  const toggleBan = (u) => {
    const nb = !u.banned;
    Alert.alert(nb?'Ban '+u.username+'?':'Unban '+u.username+'?','',[
      {text:'Annuler',style:'cancel'},
      {text:nb?'Ban':'Unban',style:'destructive',onPress:async()=>{
        await updateDoc(doc(db,'users',u.id),{banned:nb,...(nb?{bannedAt:serverTimestamp()}:{})});
        setUsers(prev=>prev.map(x=>x.id===u.id?{...x,banned:nb}:x));
      }},
    ]);
  };

  const toggleChampion = (u) => {
    const isChamp = !!u.isChampion;
    if (isChamp) {
      // Révoquer
      Alert.alert('Révoquer le titre Champion ?', u.username + ' perdra la frame et le titre.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Révoquer', style: 'destructive', onPress: async () => {
          const cleanFrames = (u.ownedFrames || []).filter(f => f !== 'champion');
          const cleanVideoFrames = (u.ownedVideoFrames || []).filter(f => f !== 'vf_champion');
          await updateDoc(doc(db, 'users', u.id), {
            isChampion: false,
            ownedFrames: cleanFrames,
            ownedVideoFrames: cleanVideoFrames,
            ...(u.equippedFrame === 'champion' ? { equippedFrame: 'none' } : {}),
          });
          setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isChampion: false } : x));
          Alert.alert('Révoqué', 'Champion retiré à ' + u.username);
        }},
      ]);
    } else {
      // Attribuer (avec option de révoquer l'actuel d'abord)
      Alert.alert('Attribuer Champion ?', 'Donner la frame et le titre Champion à ' + u.username + ' ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Couronner 👑', onPress: async () => {
          // Retire l'ancien champion d'abord
          const oldSnap = await getDocs(query(collection(db, 'users'), where('isChampion', '==', true)));
          for (const old of oldSnap.docs) {
            const od = old.data();
            await updateDoc(old.ref, {
              isChampion: false,
              ownedFrames: (od.ownedFrames || []).filter(f => f !== 'champion'),
              ownedVideoFrames: (od.ownedVideoFrames || []).filter(f => f !== 'vf_champion'),
              ...(od.equippedFrame === 'champion' ? { equippedFrame: 'none' } : {}),
            });
          }
          const now = new Date();
          const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const newOwnedFrames = [...new Set([...(u.ownedFrames || []), 'champion'])];
          const newOwnedVideoFrames = [...new Set([...(u.ownedVideoFrames || []), 'vf_champion'])];
          await updateDoc(doc(db, 'users', u.id), {
            isChampion: true,
            championMonth: monthKey,
            ownedFrames: newOwnedFrames,
            ownedVideoFrames: newOwnedVideoFrames,
            equippedFrame: 'champion',
          });
          setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isChampion: true } : x));
          Alert.alert('👑 Couronné!', u.username + ' est maintenant Champion.');
        }},
      ]);
    }
  };
  const filteredUsers = userSearch
    ? users.filter(u=>(u.username||'').toLowerCase().includes(userSearch.toLowerCase())||(u.email||'').toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  // ANNOUNCEMENT
  const [ann, setAnn] = useState({active:false,title:'',message:'',imageUrl:'',buttonText:'OK'});
  const loadAnnouncement = async () => {
    try { const s=await getDoc(doc(db,'app_config','announcement')); if(s.exists()) setAnn(s.data()); } catch(e){}
  };
  const saveAnnouncement = async () => {
    try {
      await setDoc(doc(db,'app_config','announcement'),{...ann,updatedAt:serverTimestamp()});
      Alert.alert('OK',ann.active?'Annonce activee':'Annonce desactivee');
    } catch(e){Alert.alert('Erreur',e.message);}
  };

  // VIDEOS ADMIN GALLERY
  const [adminVideos, setAdminVideos] = useState([]);
  const [adminVideosLoading, setAdminVideosLoading] = useState(false);
  const [adminVideosLoadingMore, setAdminVideosLoadingMore] = useState(false);
  const [adminVideosLastDoc, setAdminVideosLastDoc] = useState(null);
  const [adminVideosHasMore, setAdminVideosHasMore] = useState(true);
  const [adminVideoFilter, setAdminVideoFilter] = useState('all'); // 'all' | 'restricted' | 'banned'
  const [selectedAdminVideo, setSelectedAdminVideo] = useState(null);
  const ADMIN_PAGE = 20;

  // Ouvrir directement une vidéo depuis le feed (bouton "View in Admin")
  useEffect(() => {
    if (route?.params?.openVideo) {
      setTab('videos');
      setSelectedAdminVideo(route.params.openVideo);
    }
  }, [route?.params?.openVideo]);

  const loadAdminVideos = async (more = false) => {
    if (more && !adminVideosHasMore) return;
    more ? setAdminVideosLoadingMore(true) : setAdminVideosLoading(true);
    try {
      let q;
      const base = [collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(ADMIN_PAGE)];
      if (adminVideoFilter === 'restricted') base.splice(1, 0, where('restricted', '==', true));
      if (adminVideoFilter === 'banned') base.splice(1, 0, where('banned', '==', true));
      q = more && adminVideosLastDoc ? query(...base, startAfter(adminVideosLastDoc)) : query(...base);
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAdminVideos(prev => more ? [...prev, ...list] : list);
      setAdminVideosLastDoc(snap.docs[snap.docs.length - 1] || null);
      setAdminVideosHasMore(snap.docs.length === ADMIN_PAGE);
    } catch(e) {}
    more ? setAdminVideosLoadingMore(false) : setAdminVideosLoading(false);
  };

  const adminHideVideo = (video) => {
    const reasons = ['Suspicious content', 'Under review', 'Copyright issue', 'Spam', 'Other'];
    Alert.alert('🚫 Hide Video', `"${video.title || 'Untitled'}" by ${video.username}`, [
      ...reasons.map(r => ({ text: r, onPress: async () => {
        await updateDoc(doc(db, 'videos', video.id), { restricted: true, restrictedAt: serverTimestamp(), restrictedReason: r, restrictedBy: 'admin' });
        setAdminVideos(prev => prev.map(v => v.id === video.id ? { ...v, restricted: true, restrictedReason: r } : v));
        setSelectedAdminVideo(null);
        Alert.alert('🚫 Hidden', `Reason: ${r}`);
      }})),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const adminBanVideo = (video) => {
    const reasons = ['Pornographic content', 'Graphic violence', 'Hate speech', 'Harassment', 'Illegal content', 'Other'];
    Alert.alert('⛔ Ban Video', `"${video.title || 'Untitled'}" by ${video.username}`, [
      ...reasons.map(r => ({ text: r, onPress: async () => {
        await updateDoc(doc(db, 'videos', video.id), { restricted: true, banned: true, restrictedAt: serverTimestamp(), restrictedReason: r, restrictedBy: 'admin' });
        await updateDoc(doc(db, 'users', video.userId), { strikes: increment(1) });
        await addDoc(collection(db, 'notifications'), {
          userId: video.userId, type: 'system', fromUserId: 'SYSTEM', fromUsername: 'Gaming Actions',
          text: `⛔ Your video "${video.title || 'Untitled'}" was removed: ${r}. Strike added to your account.`,
          read: false, createdAt: serverTimestamp(),
        });
        setAdminVideos(prev => prev.map(v => v.id === video.id ? { ...v, restricted: true, banned: true, restrictedReason: r } : v));
        setSelectedAdminVideo(null);
        Alert.alert('⛔ Banned', `Strike issued to ${video.username}`);
      }})),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const adminUnhideVideo = async (video) => {
    await updateDoc(doc(db, 'videos', video.id), { restricted: false, banned: false });
    setAdminVideos(prev => prev.map(v => v.id === video.id ? { ...v, restricted: false, banned: false } : v));
    setSelectedAdminVideo(null);
    Alert.alert('✅ Restored');
  };

  // GAMES
  const [newGame, setNewGame] = useState('');
  const [newGenre, setNewGenre] = useState('fps');
  const [customGames, setCustomGames] = useState([]);

  const loadCustomGames = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'custom_games'), orderBy('addedAt', 'desc')));
      setCustomGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) {}
  };

  const deleteCustomGame = async (gameId, gameName) => {
    Alert.alert('Supprimer', `Supprimer "${gameName}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'custom_games', gameId));
          setCustomGames(prev => prev.filter(g => g.id !== gameId));
        } catch(e) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };
  const GL = ['fps','sports','rpg','battle_royale','action','adventure','moba','racing','fighting','strategy','simulation','other'];
  const addGame = async () => {
    if(!newGame.trim()) return Alert.alert('Erreur','Nom requis');
    const name = newGame.trim();
    const nameLower = name.toLowerCase();
    try {
      // Vérifie si le jeu existe déjà dans la liste statique (500 jeux)
      const inStatic = GAMES.some(g => g.name.toLowerCase() === nameLower);
      if(inStatic) return Alert.alert('Already exists', `"${name}" is already in the game list.`);
      // Vérifie aussi dans custom_games (Firestore)
      const existing = await getDocs(query(collection(db,'custom_games'),where('name','==',name)));
      if(!existing.empty) return Alert.alert('Already exists', `"${name}" is already in the game list.`);
      await addDoc(collection(db,'custom_games'),{name,genre:newGenre,addedAt:serverTimestamp()});
      Alert.alert('OK',name+' ajoute'); setNewGame('');
      loadCustomGames();
    } catch(e){ Alert.alert('Erreur', e.message); }
  };

  // BROADCAST
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const sendBroadcast = async () => {
    if(!notifTitle.trim()||!notifBody.trim()) return Alert.alert('Erreur','Titre et message requis');
    const uSnap = await getDocs(collection(db,'users'));
    const ops = uSnap.docs.map(d=>addDoc(collection(db,'notifications'),{
      userId:d.id,type:'system',fromUserId:'SYSTEM',fromUsername:'Gaming Actions',
      text:notifTitle+': '+notifBody,read:false,createdAt:serverTimestamp(),
    }));
    await Promise.all(ops);
    Alert.alert('Envoye','Notif envoyee a '+uSnap.size+' users'); setNotifTitle('');setNotifBody('');
  };

  // ACCESS
  const [adminEmails, setAdminEmails] = useState([]);
  const [newAdmin, setNewAdmin] = useState('');
  const loadAdmins = async () => {
    try { const s=await getDoc(doc(db,'app_config','admin_access')); if(s.exists()) setAdminEmails(s.data().emails||[]); } catch(e){}
  };
  const saveAdmins = async (l) => { await setDoc(doc(db,'app_config','admin_access'),{emails:l,updatedAt:serverTimestamp()}); setAdminEmails(l); };

  // ERROR LOGS
  const [errorLogs, setErrorLogs] = useState([]);
  const loadErrors = async () => {
    try {
      const snap = await getDocs(query(collection(db,'errorLogs'),orderBy('createdAt','desc'),limit(50)));
      setErrorLogs(snap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){}
  };

  useEffect(() => {
    if(tab==='overview') loadOverview();
    if(tab==='reports') loadReports();
    if(tab==='creators') loadCreatorReqs();
    if(tab==='moderation') loadModeration();
    if(tab==='top10') loadTop10();
    if(tab==='fraud') loadFraud();
    if(tab==='users') loadUsers();
    if(tab==='announce') loadAnnouncement();
    if(tab==='games') loadCustomGames();
    if(tab==='videos') loadAdminVideos();
    if(tab==='access') loadAdmins();
    if(tab==='errors') loadErrors();
  }, [tab]);

  const fmtDate = (ts) => {
    if(!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const h = Math.floor((Date.now()-d)/3600000);
    return h<1?'Now':h<24?h+'h':Math.floor(h/24)+'d';
  };

  return (
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="light" />
      <View style={st.header}>
        <TouchableOpacity onPress={()=>navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Admin Panel</Text>
        <TouchableOpacity onPress={()=>navigation.navigate('FrameGallery')}>
          <Ionicons name="color-palette-outline" size={22} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs}>
        {TABS.map(t=>(
          <TouchableOpacity key={t.id} onPress={()=>setTab(t.id)} style={[st.tab,tab===t.id&&st.tabActive]}>
            <Ionicons name={t.icon} size={13} color={tab===t.id?COLORS.black:COLORS.gray} />
            <Text style={[st.tabText,tab===t.id&&st.tabTextActive]}> {t.label}</Text>
            {t.id==='reports'&&stats.pendingReports>0&&<View style={st.badge}><Text style={st.badgeText}>{stats.pendingReports}</Text></View>}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding:14,paddingBottom:100}}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>{
          if(tab==='overview')loadOverview();if(tab==='reports')loadReports();if(tab==='users')loadUsers();
          if(tab==='top10')loadTop10();if(tab==='fraud')loadFraud();
        }} tintColor={COLORS.gold}/>}>

        {/* OVERVIEW */}
        {tab==='overview'&&(
          <View style={st.grid}>
            {[
              {l:'Users',v:stats.users,c:COLORS.blue},{l:'Videos',v:stats.videos,c:COLORS.gold},
              {l:'Total GG',v:stats.totalGG,c:COLORS.gold},{l:'Follows',v:stats.follows,c:COLORS.green},
              {l:'Reports',v:stats.pendingReports,c:COLORS.red},{l:'Restricted',v:stats.restricted,c:COLORS.red},
              {l:'Creators',v:stats.creators,c:COLORS.blue},{l:'Legendary',v:stats.legendary,c:COLORS.gold},
              {l:'Banned',v:stats.banned,c:COLORS.red},
            ].map((s,i)=>(
              <View key={i} style={[st.statBox,{borderColor:s.c+'30'}]}>
                <Text style={[st.statVal,{color:s.c}]}>{s.v??'--'}</Text>
                <Text style={st.statLbl}>{s.l}</Text>
              </View>
            ))}
          </View>
        )}

        {/* REPORTS */}
        {tab==='reports'&&(
          <>
            <Text style={st.secTitle}>Signalements</Text>
            {reports.length===0?<Text style={st.hint}>Aucun signalement</Text>:null}
            {reports.map(r=>{
              const isPending = r.status==='pending';
              const isVideo = r.targetType==='video';
              const td = r.targetData||{};
              return (
                <View key={r.id} style={[st.reportCard,!isPending&&{opacity:0.5}]}>
                  <View style={st.reportHeader}>
                    <View style={[st.reportTypeBadge,{backgroundColor:isVideo?COLORS.redDim:COLORS.blueDim}]}>
                      <Ionicons name={isVideo?'videocam':'person'} size={12} color={isVideo?COLORS.red:COLORS.blue}/>
                      <Text style={[st.reportTypeText,{color:isVideo?COLORS.red:COLORS.blue}]}> {isVideo?'VIDEO':'PROFIL'}</Text>
                    </View>
                    <Text style={st.reportTime}>{fmtDate(r.createdAt)}</Text>
                    <View style={[st.statusBadge,{backgroundColor:isPending?COLORS.redDim:'rgba(0,200,83,0.15)'}]}>
                      <Text style={[st.statusText,{color:isPending?COLORS.red:COLORS.green}]}>{isPending?'PENDING':'RESOLVED'}</Text>
                    </View>
                  </View>

                  <Text style={st.reportReason}>{r.reason}</Text>
                  {r.details?<Text style={st.reportDetails}>"{r.details}"</Text>:null}
                  <Text style={st.reportBy}>Par {r.reporterUsername} ({fmtDate(r.createdAt)})</Text>
                  {isVideo && td.reportCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Ionicons name="flag" size={10} color={td.reportCount >= 10 ? COLORS.red : COLORS.gold} />
                      <Text style={{ fontSize: 10, color: td.reportCount >= 10 ? COLORS.red : COLORS.gold, fontWeight: '700', marginLeft: 4 }}>
                        {td.reportCount} report{td.reportCount > 1 ? 's' : ''}{td.reportCount >= 10 ? ' — AUTO-HIDDEN' : ''}
                      </Text>
                    </View>
                  )}
                  {isVideo&&td.caption?<Text style={st.reportTarget}>Video: {td.caption}</Text>:null}
                  {isVideo&&td.username?<Text style={st.reportTargetSub}>Par {td.username} - {td.game}</Text>:null}
                  {!isVideo&&r.targetUsername?<Text style={st.reportTarget}>Profil: {r.targetUsername}</Text>:null}

                  {/* Thumbnail */}
                  {isVideo&&(td.thumbnail||td.thumbnailUrl)?(
                    <TouchableOpacity onPress={()=>navigation.navigate('VideoPlayer',{video:{...td,id:r.targetId}})} style={st.thumbWrap}>
                      <Image source={{uri:td.thumbnail||td.thumbnailUrl}} style={st.thumb} resizeMode="cover"/>
                      <View style={st.playOverlay}><Ionicons name="play" size={24} color={COLORS.white}/></View>
                      {td.restricted&&<View style={st.restrictedBanner}><Text style={st.restrictedText}>RESTRICTED</Text></View>}
                    </TouchableOpacity>
                  ):null}

                  {/* Actions */}
                  {isPending&&(
                    <View style={st.reportActions}>
                      {isVideo&&!td.restricted&&(
                        <TouchableOpacity onPress={()=>restrictVideo(r)} style={[st.actionSmall,{borderColor:COLORS.red}]}>
                          <Ionicons name="eye-off" size={14} color={COLORS.red}/>
                          <Text style={[st.actionSmallText,{color:COLORS.red}]}> Hide</Text>
                        </TouchableOpacity>
                      )}
                      {isVideo&&td.restricted&&(
                        <TouchableOpacity onPress={()=>unrestrictVideo(r.targetId)} style={[st.actionSmall,{borderColor:COLORS.green}]}>
                          <Ionicons name="eye" size={14} color={COLORS.green}/>
                          <Text style={[st.actionSmallText,{color:COLORS.green}]}> Restore</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={()=>banFromReport(r)} style={[st.actionSmall,{borderColor:COLORS.red}]}>
                        <Ionicons name="ban" size={14} color={COLORS.red}/>
                        <Text style={[st.actionSmallText,{color:COLORS.red}]}> Ban</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={()=>resolveReport(r)} style={[st.actionSmall,{borderColor:COLORS.green}]}>
                        <Ionicons name="checkmark" size={14} color={COLORS.green}/>
                        <Text style={[st.actionSmallText,{color:COLORS.green}]}> OK</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* CREATOR REQUESTS */}
        {tab==='creators'&&(
          <>
            <Text style={st.secTitle}>Creator Requests</Text>
            {creatorReqs.length===0?<Text style={st.hint}>No creator requests</Text>:null}
            {creatorReqs.map(req=>{
              const isPending = req.status==='pending';
              return (
                <View key={req.id} style={[st.reportCard,!isPending&&{opacity:0.55}]}>
                  <View style={st.reportHeader}>
                    <View style={[st.reportTypeBadge,{backgroundColor:COLORS.blueDim}]}>
                      <Ionicons name="rocket" size={12} color={COLORS.blue}/>
                      <Text style={[st.reportTypeText,{color:COLORS.blue}]}> {req.creatorType==='developer'?'DEV':'CREATOR'}</Text>
                    </View>
                    <Text style={st.reportTime}>{fmtDate(req.createdAt)}</Text>
                    <View style={[st.statusBadge,{backgroundColor:isPending?COLORS.redDim:'rgba(0,200,83,0.15)'}]}>
                      <Text style={[st.statusText,{color:isPending?COLORS.red:(req.status==='approved'?COLORS.green:COLORS.gray)}]}>{(req.status||'pending').toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={st.reportTarget}>@{req.username}</Text>
                  <Text style={st.reportTargetSub}>{(req.followers||0).toLocaleString()} followers · {req.email||'no email'}</Text>
                  <Text style={st.reportReason}>Motivation:</Text>
                  <Text style={st.reportDetails}>"{req.motivation}"</Text>
                  {req.links?<Text style={st.reportTargetSub}>🔗 {req.links}</Text>:null}
                  {req.acceptedTerms?<Text style={[st.reportTargetSub,{color:COLORS.green}]}>✓ Accepted Terms & Conditions</Text>:null}

                  {isPending&&(
                    <View style={st.reportActions}>
                      <TouchableOpacity onPress={()=>approveCreator(req)} style={[st.actionSmall,{borderColor:COLORS.green}]}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.green}/>
                        <Text style={[st.actionSmallText,{color:COLORS.green}]}> Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={()=>declineCreator(req)} style={[st.actionSmall,{borderColor:COLORS.red}]}>
                        <Ionicons name="close-circle" size={14} color={COLORS.red}/>
                        <Text style={[st.actionSmallText,{color:COLORS.red}]}> Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* MODERATION */}
        {tab==='moderation'&&(
          <>
            <Text style={st.secTitle}>Moderation</Text>

            {/* Ajout de mots interdits */}
            <Text style={[st.hint,{marginBottom:8}]}>Add custom banned words (applied on top of the built-in list). They are censored in comments automatically.</Text>
            <View style={{flexDirection:'row',marginBottom:8}}>
              <TextInput
                value={newBannedWord}
                onChangeText={setNewBannedWord}
                placeholder="e.g. badword"
                placeholderTextColor={COLORS.gray}
                style={[st.input,{flex:1,marginRight:8}]}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={addBannedWord} style={st.addBtn}>
                <Ionicons name="add" size={20} color={COLORS.black}/>
              </TouchableOpacity>
            </View>
            {bannedWords.length>0&&(
              <View style={st.wordChips}>
                {bannedWords.map((w,i)=>(
                  <TouchableOpacity key={i} onPress={()=>removeBannedWord(w)} style={st.wordChip}>
                    <Text style={st.wordChipText}>{w}</Text>
                    <Ionicons name="close" size={12} color={COLORS.red} style={{marginLeft:4}}/>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[st.secTitle,{marginTop:20}]}>Flagged Users</Text>
            <Text style={st.hint}>Users who used the most banned words in comments.</Text>
            {modCounters.length===0?<Text style={st.hint}>No flagged users yet 🎉</Text>:null}
            {modCounters.map((m,i)=>(
              <View key={m.id} style={st.modRow}>
                <View style={[st.modRank,{backgroundColor:i<3?COLORS.red:COLORS.gray3}]}>
                  <Text style={st.modRankText}>{i+1}</Text>
                </View>
                <View style={{flex:1,marginLeft:12}}>
                  <Text style={st.modName}>@{m.username||m.id}</Text>
                  <Text style={st.modSub}>Last flagged: {fmtDate(m.lastAt)}</Text>
                </View>
                <View style={st.modCountBadge}>
                  <Ionicons name="warning" size={12} color={COLORS.red}/>
                  <Text style={st.modCountText}> {m.count||0}</Text>
                </View>
              </View>
            ))}
          </>
        )}
        {tab==='top10'&&(
          <>
            {[
              {title:'Top 10 — GG Received',key:'ggReceived',icon:'star',color:COLORS.gold},
              {title:'Top 10 — GA Points',key:'gaPoints',icon:'diamond',color:COLORS.blue},
              {title:'Top 10 — Followers',key:'followers',icon:'people',color:'#7C4DFF'},
              {title:'Top 10 — Streak Points',key:'streakPoints',icon:'flash',color:COLORS.gold},
              {title:'Top 10 — Fanbase Fans',key:'fanbaseSubscribers',icon:'lock-open',color:'#00C853'},
            ].map(section=>{
              const sorted = [...allUsers].sort((a,b)=>(b[section.key]||0)-(a[section.key]||0)).slice(0,10);
              return (
                <View key={section.key} style={{marginBottom:20}}>
                  <View style={{flexDirection:'row',alignItems:'center',marginBottom:8}}>
                    <Ionicons name={section.icon} size={16} color={section.color}/>
                    <Text style={[st.secTitle,{marginLeft:8,marginBottom:0,fontSize:14}]}>{section.title}</Text>
                  </View>
                  {sorted.length===0?<Text style={st.hint}>Aucune donnee</Text>:
                    sorted.map((u,i)=>(
                      <View key={u.id} style={st.rankRow}>
                        <Text style={[st.rankNum,i<3&&{color:section.color}]}>{i+1}</Text>
                        <View style={{flex:1}}>
                          <Text style={st.rankName}>{u.username||'--'}</Text>
                          <Text style={st.rankEmail}>{u.email||u.id}</Text>
                        </View>
                        <Text style={[st.rankVal,{color:section.color}]}>{fmtK(u[section.key]||0)}</Text>
                      </View>
                    ))
                  }
                </View>
              );
            })}
            <Text style={[st.secTitle,{fontSize:14}]}>Total GA Points distribues</Text>
            <Text style={[st.statVal,{color:COLORS.blue,fontSize:28,marginBottom:20}]}>{fmtK(allUsers.reduce((s,u)=>s+(u.gaPoints||0),0))}</Text>
          </>
        )}

        {/* FRAUD DETECTION */}
        {tab==='fraud'&&(
          <>
            <Text style={st.secTitle}>Detection de fraude</Text>
            <Text style={st.hint}>Analyse automatique des comportements suspects.</Text>

            {/* Top GG givers — qui donne le plus de GGs (bots potentiels) */}
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:8,marginTop:8}}>
              <Ionicons name="alert-circle" size={16} color={COLORS.red}/>
              <Text style={[st.secTitle,{marginLeft:8,marginBottom:0,fontSize:14}]}>Top GG Givers (bots potentiels)</Text>
            </View>
            <Text style={st.hint}>Users qui donnent le plus de GGs. Un compte qui GG des centaines de fois peut etre un bot.</Text>
            {topGGGivers.length===0?<Text style={st.hint}>Aucun GG encore</Text>:
              topGGGivers.map((g,i)=>(
                <View key={g.uid} style={[st.rankRow,g.count>50&&{borderColor:COLORS.red+'50',backgroundColor:COLORS.redDim}]}>
                  <Text style={[st.rankNum,g.count>50&&{color:COLORS.red}]}>{i+1}</Text>
                  <View style={{flex:1}}>
                    <Text style={st.rankName}>{g.username}</Text>
                  </View>
                  <Text style={[st.rankVal,{color:g.count>50?COLORS.red:COLORS.gold}]}>{g.count} GGs donnes</Text>
                </View>
              ))
            }

            {/* Users avec ratio suspect — beaucoup de GG recus mais peu de videos */}
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:8,marginTop:20}}>
              <Ionicons name="warning" size={16} color={COLORS.gold}/>
              <Text style={[st.secTitle,{marginLeft:8,marginBottom:0,fontSize:14}]}>Ratio GG/Videos suspect</Text>
            </View>
            <Text style={st.hint}>Users avec beaucoup de GG recus mais tres peu de videos. Ratio {'>'}100 GG par video = suspect.</Text>
            {allUsers.filter(u=>{
              const vids = u.videosCount||0;
              const gg = u.ggReceived||0;
              return vids>0 && gg/vids>100;
            }).sort((a,b)=>((b.ggReceived||0)/(b.videosCount||1))-((a.ggReceived||0)/(a.videosCount||1))).slice(0,10).map((u,i)=>(
              <View key={u.id} style={[st.rankRow,{borderColor:COLORS.gold+'50'}]}>
                <Text style={[st.rankNum,{color:COLORS.gold}]}>{i+1}</Text>
                <View style={{flex:1}}>
                  <Text style={st.rankName}>{u.username||'--'}</Text>
                  <Text style={st.rankEmail}>{u.ggReceived||0} GG / {u.videosCount||0} videos</Text>
                </View>
                <Text style={[st.rankVal,{color:COLORS.red}]}>x{Math.round((u.ggReceived||0)/(u.videosCount||1))}</Text>
              </View>
            ))}

            {/* Users avec gaPoints anormalement elevés */}
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:8,marginTop:20}}>
              <Ionicons name="diamond" size={16} color={COLORS.blue}/>
              <Text style={[st.secTitle,{marginLeft:8,marginBottom:0,fontSize:14}]}>GA Points elevés</Text>
            </View>
            {[...allUsers].sort((a,b)=>(b.gaPoints||0)-(a.gaPoints||0)).slice(0,5).map((u,i)=>(
              <View key={u.id} style={st.rankRow}>
                <Text style={st.rankNum}>{i+1}</Text>
                <View style={{flex:1}}>
                  <Text style={st.rankName}>{u.username||'--'}</Text>
                  <Text style={st.rankEmail}>Level: {u.streakLevel||'noob'} · GG:{u.ggReceived||0} · Fol:{u.followers||0}</Text>
                </View>
                <Text style={[st.rankVal,{color:COLORS.blue}]}>{fmtK(u.gaPoints||0)} pts</Text>
              </View>
            ))}
          </>
        )}

        {/* USERS */}
        {tab==='users'&&(
          <>
            <TextInput value={userSearch} onChangeText={setUserSearch} placeholder="Rechercher..." placeholderTextColor={COLORS.gray} style={st.searchInput}/>
            <Text style={st.hint}>{filteredUsers.length} utilisateur(s)</Text>
            {filteredUsers.map(u=>(
              <View key={u.id} style={[st.userRow,u.banned&&{borderColor:COLORS.red+'50',backgroundColor:COLORS.redDim},u.isChampion&&{borderColor:COLORS.gold+'60',backgroundColor:'rgba(201,168,76,0.05)'}]}>
                <View style={{flex:1}}>
                  <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap'}}>
                    <Text style={st.userName}>{u.isChampion ? '👑 ' : ''}{u.username||'--'}</Text>
                    {u.accountType==='creator'&&<Text style={[st.badgeTag,{backgroundColor:COLORS.blue}]}>CR</Text>}
                    {u.accountType==='gameconic'&&<Text style={[st.badgeTag,{backgroundColor:COLORS.red}]}>ICON</Text>}
                    {u.plan==='legendary'&&<Text style={[st.badgeTag,{backgroundColor:COLORS.gold,color:COLORS.black}]}>LEG</Text>}
                    {u.banned&&<Text style={[st.badgeTag,{backgroundColor:COLORS.red}]}>BANNED</Text>}
                    {u.isChampion&&<Text style={[st.badgeTag,{backgroundColor:COLORS.gold,color:COLORS.black}]}>CHAMP</Text>}
                  </View>
                  <Text style={st.userEmail}>{u.email||u.id}</Text>
                  <Text style={st.userMeta}>GG:{u.ggReceived||0} Pts:{u.gaPoints||0} Fol:{u.followers||0}</Text>
                </View>
                <View style={{flexDirection:'column',gap:6}}>
                  <TouchableOpacity onPress={()=>toggleChampion(u)} style={[st.banBtn,{borderColor:u.isChampion?COLORS.red:COLORS.gold}]}>
                    <Text style={[st.banBtnText,{color:u.isChampion?COLORS.red:COLORS.gold}]}>{u.isChampion?'Revoke':'Crown'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>toggleBan(u)} style={[st.banBtn,u.banned&&{borderColor:COLORS.green}]}>
                    <Text style={[st.banBtnText,u.banned&&{color:COLORS.green}]}>{u.banned?'Unban':'Ban'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ANNOUNCE */}
        {tab==='announce'&&(
          <>
            <Text style={st.secTitle}>Annonce au lancement</Text>
            <View style={st.switchRow}><Text style={st.switchLabel}>Activee</Text><Switch value={ann.active} onValueChange={v=>setAnn(p=>({...p,active:v}))} trackColor={{true:COLORS.gold}}/></View>
            <Text style={st.fieldLabel}>Titre</Text>
            <TextInput value={ann.title} onChangeText={v=>setAnn(p=>({...p,title:v}))} style={st.input} placeholder="Titre..." placeholderTextColor={COLORS.gray}/>
            <Text style={st.fieldLabel}>Message</Text>
            <TextInput value={ann.message} onChangeText={v=>setAnn(p=>({...p,message:v}))} style={[st.input,{height:100,textAlignVertical:'top'}]} placeholder="Message..." placeholderTextColor={COLORS.gray} multiline/>
            <Text style={st.fieldLabel}>URL image</Text>
            <TextInput value={ann.imageUrl} onChangeText={v=>setAnn(p=>({...p,imageUrl:v}))} style={st.input} placeholder="https://..." placeholderTextColor={COLORS.gray} autoCapitalize="none"/>
            <Text style={st.fieldLabel}>Texte bouton</Text>
            <TextInput value={ann.buttonText} onChangeText={v=>setAnn(p=>({...p,buttonText:v}))} style={st.input} placeholder="OK" placeholderTextColor={COLORS.gray}/>
            {ann.imageUrl?<Image source={{uri:ann.imageUrl}} style={{width:'100%',height:140,borderRadius:12,marginBottom:12}} resizeMode="cover"/>:null}
            <TouchableOpacity onPress={saveAnnouncement} style={st.actionBtn}>
              <Ionicons name="save" size={16} color={COLORS.black}/><Text style={st.actionBtnText}>Sauvegarder</Text>
            </TouchableOpacity>
          </>
        )}


        {/* VIDEOS GALLERY */}
        {tab==='videos'&&(
          <>
            <Text style={st.secTitle}>Galerie Vidéos</Text>
            {/* Filtres */}
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              {[{id:'all',label:'Toutes'},{id:'restricted',label:'🚫 Hidden'},{id:'banned',label:'⛔ Banned'}].map(f=>(
                <TouchableOpacity key={f.id} onPress={()=>{setAdminVideoFilter(f.id);setTimeout(()=>loadAdminVideos(),100);}}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 8,
                    backgroundColor: adminVideoFilter===f.id ? COLORS.gold : COLORS.card,
                    borderWidth: 0.5, borderColor: adminVideoFilter===f.id ? COLORS.gold : COLORS.gray3 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: adminVideoFilter===f.id ? COLORS.black : COLORS.gray }}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {adminVideosLoading ? (
              <ActivityIndicator color={COLORS.gold} style={{ marginTop: 20 }} />
            ) : (
              <>
                {/* Grille 4 par rangée */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                  {adminVideos.map(v => {
                    const W = (Dimensions.get('window').width - 48 - 24) / 4;
                    return (
                      <TouchableOpacity key={v.id} onPress={() => setSelectedAdminVideo(v)}
                        style={{ width: W, height: W * 0.6, margin: 3, borderRadius: 6, overflow: 'hidden', backgroundColor: COLORS.card,
                          borderWidth: v.banned ? 2 : v.restricted ? 1.5 : 0,
                          borderColor: v.banned ? '#FF3B30' : v.restricted ? '#FFD700' : 'transparent' }}>
                        {v.thumbnail || v.thumbnailUrl ? (
                          <Image source={{ uri: v.thumbnail || v.thumbnailUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="videocam" size={16} color={COLORS.gray2} />
                          </View>
                        )}
                        {(v.restricted || v.banned) && (
                          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 14 }}>{v.banned ? '⛔' : '🚫'}</Text>
                          </View>
                        )}
                        {v.reportCount > 0 && (
                          <View style={{ position: 'absolute', top: 2, right: 2, backgroundColor: v.reportCount >= 10 ? COLORS.red : 'rgba(0,0,0,0.7)', borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 7, color: COLORS.white, fontWeight: '700' }}>🚩{v.reportCount}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {adminVideosHasMore && (
                  <TouchableOpacity onPress={() => loadAdminVideos(true)} style={[st.actionBtn, { marginTop: 12 }]}>
                    {adminVideosLoadingMore ? <ActivityIndicator color={COLORS.black} size="small" /> : <Text style={st.actionBtnText}>Charger plus</Text>}
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Modal vidéo sélectionnée */}
            {selectedAdminVideo && (
              <Modal visible transparent animationType="slide" statusBarTranslucent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'flex-end' }}>
                  <View style={{ backgroundColor: COLORS.dark, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>{selectedAdminVideo.title || 'Sans titre'}</Text>
                      <TouchableOpacity onPress={() => setSelectedAdminVideo(null)}>
                        <Ionicons name="close" size={22} color={COLORS.white} />
                      </TouchableOpacity>
                    </View>
                    {/* Lecteur vidéo — charge uniquement au clic */}
                    <AdminVideoPlayer videoUrl={selectedAdminVideo.videoUrl} height={180} />
                    {/* Infos */}
                    <Text style={{ color: COLORS.gray, fontSize: 12, marginBottom: 4 }}>👤 {selectedAdminVideo.username} · 🎮 {selectedAdminVideo.game}</Text>
                    <Text style={{ color: COLORS.gray, fontSize: 12, marginBottom: 4 }}>⭐ {selectedAdminVideo.ggCount||0} GG · 👁 {selectedAdminVideo.viewCount||0} views</Text>
                    {selectedAdminVideo.reportCount > 0 && (
                      <Text style={{ color: COLORS.red, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>🚩 {selectedAdminVideo.reportCount} report(s)</Text>
                    )}
                    {selectedAdminVideo.restricted && (
                      <Text style={{ color: COLORS.gold, fontSize: 11, marginBottom: 4 }}>
                        {selectedAdminVideo.banned ? '⛔ BANNED' : '🚫 HIDDEN'} — {selectedAdminVideo.restrictedReason || 'No reason'}
                      </Text>
                    )}
                    {/* Actions */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
                      {!selectedAdminVideo.restricted && (
                        <>
                          <TouchableOpacity onPress={() => adminHideVideo(selectedAdminVideo)}
                            style={{ backgroundColor: 'rgba(255,204,0,0.15)', borderWidth: 1, borderColor: '#FFCC00', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}>
                            <Text style={{ color: '#FFCC00', fontWeight: '700', fontSize: 12 }}>🚫 Hide</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => adminBanVideo(selectedAdminVideo)}
                            style={{ backgroundColor: 'rgba(255,59,48,0.15)', borderWidth: 1, borderColor: '#FF3B30', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}>
                            <Text style={{ color: '#FF3B30', fontWeight: '700', fontSize: 12 }}>⛔ Ban</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {selectedAdminVideo.restricted && (
                        <TouchableOpacity onPress={() => adminUnhideVideo(selectedAdminVideo)}
                          style={{ backgroundColor: 'rgba(0,200,83,0.15)', borderWidth: 1, borderColor: COLORS.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}>
                          <Text style={{ color: COLORS.green, fontWeight: '700', fontSize: 12 }}>✅ Unhide</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => setSelectedAdminVideo(null)}
                        style={{ backgroundColor: COLORS.card, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 }}>
                        <Text style={{ color: COLORS.gray, fontWeight: '700', fontSize: 12 }}>Fermer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
            )}
          </>
        )}

        {/* GAMES */}
        {tab==='games'&&(
          <>
            <Text style={st.secTitle}>Ajouter un jeu</Text>
            <Text style={st.fieldLabel}>Nom</Text>
            <TextInput value={newGame} onChangeText={setNewGame} style={st.input} placeholder="Ex: Marvel Rivals" placeholderTextColor={COLORS.gray}/>
            <Text style={st.fieldLabel}>Genre</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
              {GL.map(g=>(<TouchableOpacity key={g} onPress={()=>setNewGenre(g)} style={[st.genreChip,newGenre===g&&{backgroundColor:COLORS.gold,borderColor:COLORS.gold}]}><Text style={[st.genreChipText,newGenre===g&&{color:COLORS.black}]}>{g}</Text></TouchableOpacity>))}
            </ScrollView>
            <TouchableOpacity onPress={addGame} style={st.actionBtn}><Ionicons name="add-circle" size={16} color={COLORS.black}/><Text style={st.actionBtnText}>Ajouter</Text></TouchableOpacity>

            {customGames.length > 0 && (
              <>
                <Text style={[st.secTitle, { marginTop: 20 }]}>Jeux custom ({customGames.length})</Text>
                <Text style={st.hint}>Appuie sur un jeu pour le supprimer.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  {customGames.map(g => (
                    <TouchableOpacity key={g.id} onPress={() => deleteCustomGame(g.id, g.name)}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, margin: 3, borderWidth: 0.5, borderColor: COLORS.gray3 }}>
                      <Text style={{ color: COLORS.white, fontSize: 11, marginRight: 4 }}>{g.name}</Text>
                      <Text style={{ fontSize: 9, color: COLORS.gray }}>{g.genre}</Text>
                      <Ionicons name="close-circle" size={14} color={COLORS.red} style={{ marginLeft: 5 }} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* NOTIFS */}
        {tab==='notifs'&&(
          <>
            <Text style={st.secTitle}>Broadcast</Text><Text style={st.hint}>Envoie a TOUS les users.</Text>
            <Text style={st.fieldLabel}>Titre</Text>
            <TextInput value={notifTitle} onChangeText={setNotifTitle} style={st.input} placeholder="Titre..." placeholderTextColor={COLORS.gray}/>
            <Text style={st.fieldLabel}>Message</Text>
            <TextInput value={notifBody} onChangeText={setNotifBody} style={[st.input,{height:80,textAlignVertical:'top'}]} placeholder="Message..." placeholderTextColor={COLORS.gray} multiline/>
            <TouchableOpacity onPress={sendBroadcast} style={[st.actionBtn,{backgroundColor:COLORS.red}]}>
              <Ionicons name="send" size={16} color={COLORS.white}/><Text style={[st.actionBtnText,{color:COLORS.white}]}>Envoyer</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ACCESS */}
        {tab==='access'&&(
          <>
            <Text style={st.secTitle}>Acces Admin</Text>
            <Text style={st.hint}>Les admins sont gérés via le champ <Text style={{color:COLORS.gold,fontWeight:'700'}}>isAdmin: true</Text> dans Firestore → users → [document user].</Text>
            <Text style={[st.fieldLabel,{marginTop:16}]}>Ajouter un admin manuellement</Text>
            <Text style={st.hint}>Va dans Firebase Console → Firestore → users → trouve l'user → ajoute le champ isAdmin = true (boolean).</Text>
            <View style={{marginTop:12,backgroundColor:'rgba(201,168,76,0.08)',borderRadius:10,padding:12,borderWidth:0.5,borderColor:COLORS.gold}}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.gold}/>
              <Text style={{color:COLORS.gold,fontWeight:'700',marginTop:6,fontSize:13}}>Comment promouvoir un admin :</Text>
              <Text style={{color:COLORS.gray,fontSize:11,marginTop:4,lineHeight:18}}>1. Firebase Console → Firestore{'\n'}2. Collection "users" → document de l'user{'\n'}3. Ajouter champ : isAdmin = true (boolean){'\n'}4. Pour révoquer : isAdmin = false</Text>
            </View>
          </>
        )}
        {tab==='errors'&&(
          <>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <Text style={st.secTitle}>Error Logs</Text>
              <TouchableOpacity onPress={loadErrors} style={[st.actionBtn,{paddingHorizontal:12}]}>
                <Ionicons name="refresh" size={16} color={COLORS.black}/>
              </TouchableOpacity>
            </View>
            {errorLogs.length===0?<Text style={st.hint}>No errors logged yet.</Text>:errorLogs.map(err=>(
              <View key={err.id} style={[st.reportCard,{borderLeftWidth:3,borderLeftColor:COLORS.red}]}>
                <View style={{flexDirection:'row',alignItems:'center',marginBottom:4}}>
                  <Ionicons name="bug" size={14} color={COLORS.red}/>
                  <Text style={{fontSize:12,fontWeight:'800',color:COLORS.red,marginLeft:6}}>{err.context||'Unknown'}</Text>
                  <Text style={{fontSize:10,color:COLORS.gray,marginLeft:'auto'}}>{err.createdAt?.toDate?err.createdAt.toDate().toLocaleString():''}</Text>
                </View>
                {err.code&&<Text style={{fontSize:11,color:COLORS.gold,marginBottom:2}}>Code: {err.code}</Text>}
                <Text style={{fontSize:11,color:COLORS.gray}} numberOfLines={3}>{err.message}</Text>
                {err.userId&&<Text style={{fontSize:10,color:COLORS.gray,marginTop:4}}>User: {err.userId}</Text>}
              </View>
            ))}
          </>
        )}


      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export async function isAdmin() {
  return false; // Non utilisé — détection via userProfile.isAdmin dans Firestore
}

const st = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.black},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:Platform.OS==='ios'?54:30,paddingBottom:12,borderBottomWidth:0.5,borderBottomColor:COLORS.gray3},
  headerTitle:{fontSize:18,fontWeight:'900',color:COLORS.white},
  tabs:{paddingHorizontal:14,paddingVertical:10},
  tab:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:7,borderRadius:20,backgroundColor:COLORS.card,borderWidth:0.5,borderColor:COLORS.gray3,marginRight:8,height:34},
  tabActive:{backgroundColor:COLORS.gold,borderColor:COLORS.gold},
  tabText:{fontSize:11,color:COLORS.gray,fontWeight:'700'},tabTextActive:{color:COLORS.black,fontWeight:'900'},
  badge:{backgroundColor:COLORS.red,borderRadius:10,paddingHorizontal:5,paddingVertical:1,marginLeft:4},
  badgeText:{fontSize:9,fontWeight:'900',color:COLORS.white},
  secTitle:{fontSize:18,fontWeight:'900',color:COLORS.white,marginBottom:8},
  hint:{fontSize:12,color:COLORS.gray,lineHeight:17,marginBottom:14},
  modRow:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:12,padding:12,marginBottom:8,borderWidth:0.5,borderColor:COLORS.gray3},
  modRank:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center'},
  modRankText:{fontSize:13,fontWeight:'900',color:COLORS.white},
  modName:{fontSize:14,fontWeight:'700',color:COLORS.white},
  modSub:{fontSize:11,color:COLORS.gray,marginTop:2},
  modCountBadge:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.redDim,paddingHorizontal:10,paddingVertical:5,borderRadius:14},
  modCountText:{fontSize:13,fontWeight:'900',color:COLORS.red},
  addBtn:{width:46,height:46,borderRadius:12,backgroundColor:COLORS.gold,alignItems:'center',justifyContent:'center'},
  wordChips:{flexDirection:'row',flexWrap:'wrap',marginBottom:8},
  wordChip:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.redDim,paddingHorizontal:10,paddingVertical:6,borderRadius:14,marginRight:6,marginBottom:6},
  wordChipText:{fontSize:12,color:COLORS.white,fontWeight:'600'},
  grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
  statBox:{width:'31%',backgroundColor:COLORS.card,borderRadius:12,padding:12,marginBottom:10,borderWidth:0.5,alignItems:'center'},
  statVal:{fontSize:20,fontWeight:'900'},statLbl:{fontSize:9,color:COLORS.gray,marginTop:4,textTransform:'uppercase',letterSpacing:0.5},
  // Reports
  reportCard:{backgroundColor:COLORS.card,borderRadius:14,padding:14,marginBottom:12,borderWidth:0.5,borderColor:COLORS.gray3},
  reportHeader:{flexDirection:'row',alignItems:'center',marginBottom:8},
  reportTypeBadge:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:3,borderRadius:6},
  reportTypeText:{fontSize:10,fontWeight:'800'},
  reportTime:{fontSize:10,color:COLORS.gray,marginLeft:8,flex:1},
  statusBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:6},
  statusText:{fontSize:9,fontWeight:'900'},
  reportReason:{fontSize:14,fontWeight:'700',color:COLORS.white,marginBottom:4},
  reportDetails:{fontSize:12,color:COLORS.gray,fontStyle:'italic',marginBottom:4},
  reportBy:{fontSize:10,color:COLORS.gray2,marginBottom:8},
  reportTarget:{fontSize:13,color:COLORS.white,fontWeight:'600'},
  reportTargetSub:{fontSize:11,color:COLORS.gray,marginBottom:6},
  thumbWrap:{width:'100%',height:140,borderRadius:10,overflow:'hidden',marginTop:8,marginBottom:8,backgroundColor:'#060610'},
  thumb:{width:'100%',height:'100%'},
  playOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(0,0,0,0.3)'},
  restrictedBanner:{position:'absolute',top:8,right:8,backgroundColor:COLORS.red,paddingHorizontal:8,paddingVertical:3,borderRadius:4},
  restrictedText:{fontSize:9,fontWeight:'900',color:COLORS.white},
  reportActions:{flexDirection:'row',marginTop:8,flexWrap:'wrap'},
  actionSmall:{flexDirection:'row',alignItems:'center',paddingHorizontal:10,paddingVertical:6,borderRadius:8,borderWidth:1,marginRight:8,marginBottom:4},
  actionSmallText:{fontSize:11,fontWeight:'700'},
  // Users
  searchInput:{backgroundColor:COLORS.card,borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:14,color:COLORS.white,borderWidth:0.5,borderColor:COLORS.gray3,marginBottom:10},
  userRow:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:12,padding:12,marginBottom:8,borderWidth:0.5,borderColor:COLORS.gray3},
  userName:{fontSize:14,fontWeight:'700',color:COLORS.white,marginRight:6},userEmail:{fontSize:11,color:COLORS.gray,marginTop:2},userMeta:{fontSize:10,color:COLORS.gray2,marginTop:2},
  badgeTag:{fontSize:8,fontWeight:'900',color:COLORS.white,paddingHorizontal:5,paddingVertical:2,borderRadius:4,marginRight:4,overflow:'hidden'},
  banBtn:{paddingHorizontal:12,paddingVertical:6,borderRadius:8,borderWidth:1,borderColor:COLORS.red},banBtnText:{fontSize:11,fontWeight:'700',color:COLORS.red},
  // Common
  switchRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14,paddingVertical:8},switchLabel:{fontSize:14,color:COLORS.white,fontWeight:'700'},
  fieldLabel:{fontSize:10,color:COLORS.gray,fontWeight:'700',letterSpacing:1,marginBottom:6,marginTop:4},
  input:{backgroundColor:COLORS.card,borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:14,color:COLORS.white,borderWidth:0.5,borderColor:COLORS.gray3,marginBottom:12},
  actionBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',backgroundColor:COLORS.gold,borderRadius:12,paddingVertical:14,marginTop:8},
  actionBtnText:{fontSize:14,fontWeight:'800',color:COLORS.black,marginLeft:6},
  genreChip:{paddingHorizontal:12,paddingVertical:6,borderRadius:16,backgroundColor:COLORS.card,borderWidth:0.5,borderColor:COLORS.gray3,marginRight:6},genreChipText:{fontSize:11,color:COLORS.gray,fontWeight:'600'},
  adminRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:0.5,borderBottomColor:COLORS.gray3},adminEmail:{flex:1,fontSize:13,color:COLORS.white,marginLeft:10},
  // Rankings
  rankRow:{flexDirection:'row',alignItems:'center',paddingVertical:8,paddingHorizontal:4,borderBottomWidth:0.5,borderBottomColor:COLORS.gray3,borderWidth:0.5,borderColor:'transparent',borderRadius:8,marginBottom:2},
  rankNum:{fontSize:14,fontWeight:'900',color:COLORS.gray,width:28,textAlign:'center'},
  rankName:{fontSize:13,fontWeight:'700',color:COLORS.white},
  rankEmail:{fontSize:10,color:COLORS.gray,marginTop:1},
  rankVal:{fontSize:13,fontWeight:'800'},
});