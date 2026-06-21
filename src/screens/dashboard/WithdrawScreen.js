import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert, Modal, TouchableWithoutFeedback } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

const METHODS = [
  { id: 'paypal', label: 'PayPal', icon: 'logo-paypal', color: '#003087' },
  { id: 'stripe', label: 'secure payment / Bank', icon: 'card-outline', color: '#635BFF' },
  { id: 'interac', label: 'Interac (Canada)', icon: 'cash-outline', color: COLORS.red },
];


function PaymentPopup({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: '#141420', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: '#2A2A3A' }}>
              <Text style={{ fontSize: 40 }}>⏳</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFFFFF', marginTop: 14, marginBottom: 10 }}>Coming Soon</Text>
              <Text style={{ fontSize: 14, color: '#888899', textAlign: 'center', lineHeight: 21, marginBottom: 20 }}>
                Withdrawals will be available once payments are live.{'\n\n'}🚀 Thanks for your patience!
              </Text>
              <TouchableOpacity onPress={onClose} style={{ backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 30 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0A0A0F' }}>Got it 👌</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default function WithdrawScreen({ navigation }) {
  const [showPayment, setShowPayment] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(null);
  const [email, setEmail] = useState('');
  const available = 0.00;

  const handleWithdraw = () => {
    return setShowPayment(true);
    const num = parseFloat(amount);
    if (!num || num < 10) return Alert.alert('Error', 'Minimum withdrawal is $10.');
    if (num > available) return Alert.alert('Error', `Maximum available is $${available.toFixed(2)}.`);
    if (!method) return Alert.alert('Error', 'Select a withdrawal method.');
    if (!email.includes('@')) return Alert.alert('Error', 'Enter a valid email/account.');
    Alert.alert('Withdrawal Requested', `$${num.toFixed(2)} will be sent to ${email} via ${method} within 3-5 business days.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  const quickAmounts = [25, 50, 100, available];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <PaymentPopup visible={showPayment} onClose={() => setShowPayment(false)} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw Funds</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>${available.toFixed(2)}</Text>
          <Text style={styles.balanceSub}>Processing fee: 2.5% · Min $10</Text>
        </View>

        <Text style={styles.sectionLabel}>AMOUNT</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencySign}>$</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={COLORS.gray}
          />
        </View>
        <View style={styles.quickAmounts}>
          {quickAmounts.map((a) => (
            <TouchableOpacity key={a} onPress={() => setAmount(String(a))} style={[styles.quickBtn, amount === String(a) && styles.quickBtnActive]}>
              <Text style={[styles.quickBtnText, amount === String(a) && styles.quickBtnTextActive]}>${a === available ? 'All' : a}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>METHOD</Text>
        {METHODS.map((m) => (
          <TouchableOpacity key={m.id} onPress={() => setMethod(m.id)} style={[styles.methodCard, method === m.id && { borderColor: m.color, backgroundColor: m.color + '10' }]}>
            <View style={[styles.methodIcon, { backgroundColor: m.color + '18' }]}>
              <Ionicons name={m.icon} size={20} color={m.color} />
            </View>
            <Text style={styles.methodLabel}>{m.label}</Text>
            {method === m.id && <Ionicons name="checkmark-circle" size={20} color={m.color} />}
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionLabel}>EMAIL / ACCOUNT</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor={COLORS.gray}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {amount && parseFloat(amount) >= 10 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryValue}>${parseFloat(amount || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Fee (2.5%)</Text>
              <Text style={[styles.summaryValue, { color: COLORS.red }]}>-${(parseFloat(amount || 0) * 0.025).toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryRow, { borderTopWidth: 0.5, borderTopColor: COLORS.gray3, paddingTop: 8 }]}>
              <Text style={[styles.summaryLabel, { color: COLORS.white }]}>You receive</Text>
              <Text style={[styles.summaryValue, { color: COLORS.green, fontSize: 16 }]}>${(parseFloat(amount || 0) * 0.975).toFixed(2)}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity onPress={handleWithdraw} style={styles.withdrawBtn}>
          <Ionicons name="wallet-outline" size={18} color={COLORS.black} />
          <Text style={styles.withdrawBtnText}>Request Withdrawal</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  balanceCard: { backgroundColor: '#0d1a10', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.green + '40', marginBottom: 20 },
  balanceLabel: { fontSize: 11, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1 },
  balanceAmount: { fontSize: 40, fontWeight: '900', color: COLORS.green, marginVertical: 6 },
  balanceSub: { fontSize: 11, color: COLORS.gray },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 10 },
  currencySign: { fontSize: 24, color: COLORS.green, fontWeight: '700', marginRight: 6 },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', color: COLORS.white, paddingVertical: 14 },
  quickAmounts: { flexDirection: 'row', marginBottom: 20 },
  quickBtn: { flex: 1, paddingVertical: 8, marginRight: 8, borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, alignItems: 'center' },
  quickBtnActive: { backgroundColor: 'rgba(0,200,83,0.15)', borderColor: COLORS.green },
  quickBtnText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  quickBtnTextActive: { color: COLORS.green, fontWeight: '700' },
  methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 10 },
  methodIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  methodLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.white },
  input: { backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 16 },
  summaryCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { fontSize: 13, color: COLORS.gray },
  summaryValue: { fontSize: 13, color: COLORS.white, fontWeight: '600' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16 },
  withdrawBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
});