import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import useAuthStore from '../store/useAuthStore';

import FeedScreen from '../screens/feed/FeedScreen';
import CommentsScreen from '../screens/feed/CommentsScreen';
import VideoPlayerScreen from '../screens/feed/VideoPlayerScreen';
import TipsScreen from '../screens/tips/TipsScreen';
import TipDetailScreen from '../screens/tips/TipDetailScreen';
import FanbaseScreen from '../screens/tips/FanbaseScreen';
import RankingsScreen from '../screens/rankings/RankingsScreen';
import CountdownScreen from '../screens/rankings/CountdownScreen';
import ShopScreen from '../screens/shop/ShopScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import FollowersScreen from '../screens/profile/FollowersScreen';
import FollowingScreen from '../screens/profile/FollowingScreen';
import PointsHistoryScreen from '../screens/profile/PointsHistoryScreen';
import PurchasesScreen from '../screens/shop/PurchasesScreen';
import MyLinksScreen from '../screens/profile/MyLinksScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import ChangeEmailScreen from '../screens/settings/ChangeEmailScreen';
import BlockedUsersScreen from '../screens/settings/BlockedUsersScreen';
import RequestCreatorScreen from '../screens/settings/RequestCreatorScreen';
import CreatorEarningsScreen from '../screens/settings/CreatorEarningsScreen';
import StrikesScreen from '../screens/settings/StrikesScreen';
import HelpScreen from '../screens/settings/HelpScreen';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import WithdrawScreen from '../screens/dashboard/WithdrawScreen';
import AdminScreen from '../screens/admin/AdminScreen';
import FrameGalleryScreen from '../screens/admin/FrameGalleryScreen';
import PrivacyPolicyScreen from '../screens/legal/PrivacyPolicyScreen';
import TermsScreen from '../screens/legal/TermsScreen';
import ReportBugScreen from '../screens/legal/ReportBugScreen';
import ContestRulesScreen from '../screens/legal/ContestRulesScreen';
import UploadScreen from '../screens/upload/UploadScreen';
import ContentTypeScreen from '../screens/upload/ContentTypeScreen';
import HowToUploadScreen from '../screens/upload/HowToUploadScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import ReportScreen from '../screens/report/ReportScreen';
import SubscriptionScreen from '../screens/subscription/SubscriptionScreen';
import EarningsScreen from '../screens/earnings/EarningsScreen';
import ProfileFeedScreen from '../screens/profile/ProfileFeedScreen';
import GiftCardsScreen from '../screens/giftcards/GiftCardsScreen';
import SearchScreen from '../screens/search/SearchScreen';
import HashtagScreen from '../screens/search/HashtagScreen';
import MyFanbaseScreen from '../screens/fanbase/MyFanbaseScreen';
import FanBoxScreen from '../screens/fanbase/FanBoxScreen';
import FanbaseManageScreen from '../screens/fanbase/FanbaseManageScreen';
import FanbaseOpenScreen from '../screens/fanbase/FanbaseOpenScreen';
import FanbaseContentScreen from '../screens/fanbase/FanbaseContentScreen';
import NotificationsSettingsScreen from '../screens/settings/NotificationsSettingsScreen';
import BellsListScreen from '../screens/settings/BellsListScreen';
import SubscriptionSuccessScreen from '../screens/subscription/SubscriptionSuccessScreen';
import EditVideoScreen from '../screens/upload/EditVideoScreen';
import CommunityGuidelinesScreen from '../screens/legal/CommunityGuidelinesScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FeedMain" component={FeedScreen} />
      <Stack.Screen name="Comments" component={CommentsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="VideoPlayer" component={VideoPlayerScreen} />
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="CreatorEarnings" component={CreatorEarningsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="Admin" component={AdminScreen} />
      <Stack.Screen name="FrameGallery" component={FrameGalleryScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
      <Stack.Screen name="ReportBug" component={ReportBugScreen} />
      <Stack.Screen name="ContestRules" component={ContestRulesScreen} />
      <Stack.Screen name="Followers" component={FollowersScreen} />
      <Stack.Screen name="Following" component={FollowingScreen} />
      <Stack.Screen name="PointsHistory" component={PointsHistoryScreen} />
      <Stack.Screen name="Purchases" component={PurchasesScreen} />
      <Stack.Screen name="MyLinks" component={MyLinksScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
      <Stack.Screen name="RequestCreator" component={RequestCreatorScreen} />
      <Stack.Screen name="Strikes" component={StrikesScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Report" component={ReportScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="ProfileFeed" component={ProfileFeedScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="GiftCards" component={GiftCardsScreen} />
      <Stack.Screen name="HowToUpload" component={HowToUploadScreen} />
      <Stack.Screen name="Fanbase" component={FanbaseScreen} />
      <Stack.Screen name="FanbaseContent" component={FanbaseContentScreen} />
      <Stack.Screen name="FanbaseOpen" component={FanbaseOpenScreen} />
      <Stack.Screen name="FanbaseManage" component={FanbaseManageScreen} />
      <Stack.Screen name="Shop" component={ShopScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Hashtag" component={HashtagScreen} />
      <Stack.Screen name="MyFanbase" component={MyFanbaseScreen} />
      <Stack.Screen name="FanBox" component={FanBoxScreen} />
      <Stack.Screen name="TipDetail" component={TipDetailScreen} />
      <Stack.Screen name="SubscriptionSuccess" component={SubscriptionSuccessScreen} />
      <Stack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} />
      <Stack.Screen name="EditVideo" component={EditVideoScreen} />
<Stack.Screen name="BellsList" component={BellsListScreen} />
    </Stack.Navigator>
  );
}

function TipsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TipsMain" component={TipsScreen} />
      <Stack.Screen name="TipDetail" component={TipDetailScreen} />
      <Stack.Screen name="Fanbase" component={FanbaseScreen} />
      <Stack.Screen name="FanBox" component={FanBoxScreen} />
      <Stack.Screen name="FanbaseContent" component={FanbaseContentScreen} />
      <Stack.Screen name="FanbaseManage" component={FanbaseManageScreen} />
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
      <Stack.Screen name="Followers" component={FollowersScreen} />
      <Stack.Screen name="Following" component={FollowingScreen} />
      <Stack.Screen name="PointsHistory" component={PointsHistoryScreen} />
      <Stack.Screen name="Purchases" component={PurchasesScreen} />
      <Stack.Screen name="Report" component={ReportScreen} />
      <Stack.Screen name="VideoPlayer" component={VideoPlayerScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="CreatorEarnings" component={CreatorEarningsScreen} />
      <Stack.Screen name="MyFanbase" component={MyFanbaseScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} />
      <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
      <Stack.Screen name="ProfileFeed" component={ProfileFeedScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Comments" component={CommentsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EditVideo" component={EditVideoScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
    </Stack.Navigator>
  );
}

function RankingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RankingsMain" component={RankingsScreen} />
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
      <Stack.Screen name="TipDetail" component={TipDetailScreen} />
      <Stack.Screen name="VideoPlayer" component={VideoPlayerScreen} />
      <Stack.Screen name="Countdown" component={CountdownScreen} />
      <Stack.Screen name="FanbaseContent" component={FanbaseContentScreen} />
      <Stack.Screen name="FanbaseManage" component={FanbaseManageScreen} />
      <Stack.Screen name="FanBox" component={FanBoxScreen} />
      <Stack.Screen name="Fanbase" component={FanbaseScreen} />
      <Stack.Screen name="Followers" component={FollowersScreen} />
      <Stack.Screen name="Following" component={FollowingScreen} />
      <Stack.Screen name="PointsHistory" component={PointsHistoryScreen} />
      <Stack.Screen name="Purchases" component={PurchasesScreen} />
      <Stack.Screen name="MyFanbase" component={MyFanbaseScreen} />
      <Stack.Screen name="ProfileFeed" component={ProfileFeedScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Comments" component={CommentsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EditVideo" component={EditVideoScreen} />
      <Stack.Screen name="Report" component={ReportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
    </Stack.Navigator>
  );
}

function ShopStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ShopMain" component={ShopScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="ProfileFeed" component={ProfileFeedScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Comments" component={CommentsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="GiftCards" component={GiftCardsScreen} />
      <Stack.Screen name="Purchases" component={PurchasesScreen} />
      <Stack.Screen name="PointsHistory" component={PointsHistoryScreen} />
    </Stack.Navigator>
  );
}

function UploadStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ContentType" component={ContentTypeScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="UploadMain" component={UploadScreen} />
      <Stack.Screen name="HowToUpload" component={HowToUploadScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
    </Stack.Navigator>
  );
}

function CustomTabBar({ state, descriptors, navigation }) {
  const isGuest    = useAuthStore((s) => s.isGuest);
  const exitGuest  = useAuthStore((s) => s.exitGuestMode);

  const iconMap = {
    Feed: ['home', 'home-outline'],
    Tips: ['game-controller', 'game-controller-outline'],
    Rankings: ['trophy', 'trophy-outline'],
    Shop: ['storefront', 'storefront-outline'],
  };

  // Hide tab bar when inside a nested screen
  const activeRoute = state.routes[state.index];
  const activeState = activeRoute?.state;
  const activeStackIndex = activeState?.index ?? 0;
  if (activeStackIndex > 0) return null;

  const showGuestAlert = () => Alert.alert(
    'Rejoins Gaming Actions 🎮',
    'Crée un compte gratuit pour accéder à toutes les fonctionnalités.',
    [
      { text: 'Pas maintenant', style: 'cancel' },
      { text: 'Créer un compte', onPress: () => exitGuest() },
    ]
  );

  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const isUpload = route.name === 'Upload';
        const isRestricted = isGuest && ['Tips', 'Shop', 'Upload'].includes(route.name);

        const onPress = () => {
          if (isRestricted) { showGuestAlert(); return; }
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (isUpload) {
          return (
            <TouchableOpacity key={route.key} onPress={onPress} style={styles.uploadBtn} activeOpacity={0.85}>
              <View style={styles.uploadBtnInner}>
                <Ionicons name="add" size={26} color={COLORS.black} />
              </View>
            </TouchableOpacity>
          );
        }

        const icons = iconMap[route.name] || ['ellipse', 'ellipse-outline'];
        return (
          <TouchableOpacity key={route.key} onPress={onPress} style={styles.tabItem} activeOpacity={0.7}>
            <Ionicons name={isFocused ? icons[0] : icons[1]} size={22} color={isFocused ? COLORS.gold : COLORS.gray2} />
            <View style={[styles.tabDot, isFocused && styles.tabDotActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function MainNavigator() {
  return (
    <Tab.Navigator tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Feed" component={FeedStack} />
      <Tab.Screen name="Tips" component={TipsStack} />
      <Tab.Screen name="Upload" component={UploadStack} />
      <Tab.Screen name="Rankings" component={RankingsStack} />
      <Tab.Screen name="Shop" component={ShopStack} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(6,6,14,0.98)',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray3,
    height: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent', marginTop: 3 },
  tabDotActive: { backgroundColor: COLORS.gold },
  uploadBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  uploadBtnInner: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    shadowColor: COLORS.gold, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
});