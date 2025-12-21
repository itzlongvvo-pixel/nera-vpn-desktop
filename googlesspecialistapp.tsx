import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';

// ==========================================
// CONFIG & DICTIONARY
// ==========================================
const PROJECT_ID = "8d9e2365-2178-43d9-9556-9b5753447cce";
const COMMISSION_RATE = 0.10;
let currentLang = 'en';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const LOTUS_LOGO = 'https://source.unsplash.com/random/100x100/?lotus+flower+icon';
const CATEGORIES = [
  { id: 1, name: 'Cleaning', vnName: 'Dọn dẹp', icon: 'sparkles', color: '#E3F2FD', iconColor: '#2196F3', image: 'https://tvnbiihpztqffsyxzgwx.supabase.co/storage/v1/object/public/category-images/BroomFFDAB9_300x300.png' },
  { id: 2, name: 'Repairs', vnName: 'Sửa chữa', icon: 'hammer', color: '#FFF3E0', iconColor: '#FF9800', image: 'https://tvnbiihpztqffsyxzgwx.supabase.co/storage/v1/object/public/category-images/HammerFFDAB9_300x300_single.png' },
  { id: 3, name: 'Moving', vnName: 'Chuyển nhà', icon: 'cube', color: '#E8F5E9', iconColor: '#4CAF50', image: 'https://tvnbiihpztqffsyxzgwx.supabase.co/storage/v1/object/public/category-images/TruckFFDAB9_300x300.png' },
  { id: 4, name: 'Tech Help', vnName: 'Hỗ trợ kỹ thuật', icon: 'desktop', color: '#F3E5F5', iconColor: '#9C27B0', image: 'https://tvnbiihpztqffsyxzgwx.supabase.co/storage/v1/object/public/category-images/LaptopFFDAB9_300x300.png' },
];

const TEXT = {
    en: { greeting: "Good morning,", find_specialist: "Find a Specialist", browse: "Browse Now", services: "Services", my_activity: "My Activity", market: "Marketplace", schedule: "Schedule", wallet: "Wallet", home: "Home", activity: "Activity", edit_profile: "Edit Profile", save: "Save Changes", logout: "Log Out", verify: "Verify Identity", pending: "Verification Pending", verified_status: "Identity Verified ✓", jobs_done: "Jobs", earnings: "Earnings", rate_review: "Rate & Review", reviewed: "Reviewed ✓", chat: "Chat", accept: "Accept Job", complete: "Mark as Completed", book: "Book", confirm: "Confirm Booking", address: "Address", details: "Details", pricing: "Pricing", skills: "Skills & Tools", about: "About Me", reviews: "Reviews", portfolio: "Work Portfolio", hire_for: "Hire for", est_cost: "Estimated Cost", service_fee: "Service Fee", travel_fee: "Travel Fee", total: "Total", top_up: "+ Top Up Credits", history: "History", view_profile: "View Profile & Hire", no_jobs: "No jobs available.", credit_balance: "Credit Balance", keep_positive: "Keep positive to accept jobs", upload_id_text: "Upload your Citizen ID (CCCD) to get the Verified Badge.", pay_title: "Top Up Wallet", select_amount: "Select Amount", pay_method: "Payment Method", confirm_pay: "Pay Now", processing: "Processing...", success: "Payment Successful!", email_label: 'Email', password_label: 'Password', email_placeholder: 'Enter your email', password_placeholder: 'Enter your password', signup_button: 'Sign Up', login_button: 'Log In', have_account: 'Have account? Log In', new_user: 'New? Sign Up', client_role: 'Client', specialist_role: 'Specialist', welcome: 'Welcome', become_specialist: 'Become a Specialist', find_specialist: 'Find a Specialist', notifications: 'Notifications', no_notifications: 'No notifications yet.' },
    vn: { greeting: "Chào,", find_specialist: "Tìm Chuyên Gia", browse: "Xem Ngay", services: "Dịch Vụ", my_activity: "Hoạt Động", market: "Chợ Việc", schedule: "Lịch Trình", wallet: "Ví Tiền", home: "Trang Chủ", activity: "Hoạt Động", edit_profile: "Hồ Sơ", save: "Lưu Thay Đổi", logout: "Đăng Xuất", verify: "Xác Minh Danh Tính", pending: "Đang Chờ Duyệt", verified_status: "Đã Xác Minh ✓", jobs_done: "Việc", earnings: "Thu Nhập", rate_review: "Đánh Giá", reviewed: "Đã Đánh Giá ✓", chat: "Nhắn Tin", accept: "Nhận Việc", complete: "Hoàn Thành", book: "Đặt Lịch", confirm: "Xác Nhận", address: "Địa Chỉ", details: "Chi Tiết", pricing: "Giá Cả", skills: "Kỹ Năng & Dụng Cụ", about: "Giới Thiệu", reviews: "Đánh Giá", portfolio: "Hồ Sơ Ảnh", hire_for: "Thuê Giá", est_cost: "Chi Phí Dự Tính", service_fee: "Phí Dịch Vụ", travel_fee: "Phí Di Chuyển", total: "Tổng Cộng", top_up: "Nạp Tiền", history: "Lịch Sử Giao Dịch", view_profile: "Xem Hồ Sơ & Thuê", no_jobs: "Chưa có công việc nào.", credit_balance: "Số Dư Tín Dụng", keep_positive: "Cần số dư dương để nhận việc", upload_id_text: "Tải lên CCCD để nhận huy hiệu Xác Minh.", pay_title: "Nạp Tiền Vào Ví", select_amount: "Chọn Số Tiền", pay_method: "Phương Thức", confirm_pay: "Thanh Toán Ngay", processing: "Đang xử lý...", success: "Thanh toán thành công!", email_label: 'Địa chỉ email', password_label: 'Mật khẩu', email_placeholder: 'Nhập email của bạn', password_placeholder: 'Nhập mật khẩu', signup_button: 'Đăng ký', login_button: 'Đăng nhập', have_account: 'Có tài khoản? Đăng nhập', new_user: 'Mới? Đăng ký', client_role: 'Khách hàng', specialist_role: 'Chuyên gia', welcome: 'Chào mừng', become_specialist: 'Trở thành Chuyên Gia', find_specialist: 'Tìm Chuyên Gia', notifications: 'Thông báo', no_notifications: 'Chưa có thông báo.' }
};

function t(key) { return TEXT[currentLang][key] || key; }
function formatVND(amount) { if (amount == null) return '0 ₫'; return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount); }
function getRankBadge(count) { if (count >= 50) return { label: 'SPECIALIST', color: '#805AD5', icon: 'trophy', bg: '#FAF5FF', border: '#D6BCFA' }; if (count >= 30) return { label: 'ELITE', color: '#D69E2E', icon: 'star', bg: '#FFFFF0', border: '#F6E05E' }; if (count >= 10) return { label: 'PRO', color: '#38A169', icon: 'construct', bg: '#F0FFF4', border: '#9AE6B4' }; return { label: 'NEW', color: '#718096', icon: 'leaf', bg: '#F7FAFC', border: '#EDF2F7' }; }
function calculateDistance(lat1, lon1, lat2, lon2) { if (!lat1 || !lat2) return "0.0"; const R = 6371; const dLat = (lat2-lat1)*(Math.PI/180); const dLon = (lon2-lon1)*(Math.PI/180); const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*(Math.PI/180))*Math.cos(lat2*(Math.PI/180))*Math.sin(dLon/2)*Math.sin(dLon/2); return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1); }

// ==========================================
// 1. PAYMENT GATEWAY
// ==========================================
function PaymentModal({ session, onClose, onSuccess }) {
    const [amount, setAmount] = useState(200000);
    const [method, setMethod] = useState('Momo');
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    async function handlePayment() {
        setLoading(true);
        setTimeout(async () => {
            const { data: p } = await supabase.from('profiles').select('wallet_balance').eq('id', session.user.id).single();
            await supabase.from('profiles').update({ wallet_balance: (p?.wallet_balance || 0) + amount }).eq('id', session.user.id);
            await supabase.from('transactions').insert([{ specialist_id: session.user.id, amount: amount, description: `Top Up via ${method}` }]);
            setLoading(false);
            setStep(3);
        }, 2000);
    }
    return (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.modalFullOverlay}>
            <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
                <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                    <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#fff"/></TouchableOpacity>
                    <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('pay_title')}</Text>
                    <View style={{width:24}}/>
                </LinearGradient>
                <ScrollView contentContainerStyle={{padding: 24, alignItems:'center'}}>
                    {step === 1 && (
                        <>
                            <Text style={styles.sectionLabel}>{t('select_amount')}</Text>
                            <View style={{flexDirection:'row', flexWrap:'wrap', gap:10, justifyContent:'center'}}>
                                {[100000, 200000, 500000, 1000000].map(amt => (
                                    <TouchableOpacity key={amt} onPress={() => setAmount(amt)} style={[styles.amountBox, amount===amt && styles.amountBoxActive]}>
                                        <Text style={[styles.amountText, amount===amt && {color:'#fff'}]}>{formatVND(amt)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={styles.sectionLabel}>{t('pay_method')}</Text>
                            <View style={{width:'100%'}}>
                                {['Momo', 'ZaloPay', 'Bank Transfer'].map(m => (
                                    <TouchableOpacity key={m} onPress={() => setMethod(m)} style={[styles.methodRow, method===m && styles.methodRowActive]}>
                                        <Ionicons name={m==='Bank Transfer'?'card':'phone-portrait'} size={24} color={method===m?'#FF6B6B':'#A0AEC0'}/>
                                        <Text style={{marginLeft:10, fontWeight:'bold', color:'#2D3748'}}>{m}</Text>
                                        {method===m && <Ionicons name="checkmark-circle" size={24} color="#FF6B6B" style={{marginLeft:'auto'}}/>}
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.primaryBtn}>
                                <TouchableOpacity onPress={() => setStep(2)}>
                                    <Text style={styles.primaryBtnText}>{t('confirm')}</Text>
                                </TouchableOpacity>
                            </LinearGradient>
                        </>
                    )}
                    {step === 2 && (
                        <View style={{alignItems:'center', marginTop:40}}>
                            <Text style={{fontSize:18, fontWeight:'bold', marginBottom:10}}>Scan to Pay {formatVND(amount)}</Text>
                            <LinearGradient colors={['#2D3748', '#4A5568']} style={{width:250, height:250, justifyContent:'center', alignItems:'center', borderRadius:30}}>
                                <Ionicons name="qr-code" size={150} color="#fff" />
                            </LinearGradient>
                            <Text style={{marginTop:20, color:'#718096'}}>Open your {method} app.</Text>
                            <LinearGradient colors={['#FF9F1C', '#FFBF69']} style={[styles.primaryBtn, {marginTop:40, width:'100%'}]}>
                                <TouchableOpacity onPress={handlePayment} disabled={loading}>
                                    {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryBtnText}>Simulate Payment Success</Text>}
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>
                    )}
                    {step === 3 && (
                        <View style={{alignItems:'center', marginTop:60}}>
                            <Ionicons name="checkmark-circle" size={100} color="#FF9F1C" />
                            <Text style={{fontSize:24, fontWeight:'bold', marginVertical:20}}>{t('success')}</Text>
                            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.primaryBtn}>
                                <TouchableOpacity onPress={() => { onSuccess(); onClose(); }}>
                                    <Text style={styles.primaryBtnText}>Done</Text>
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </Animated.View>
    );
}

// ==========================================
// 2. ADMIN SCREEN
// ==========================================
function AdminScreen() {
    const [pendingUsers, setPendingUsers] = useState([]); const [activeTab, setActiveTab] = useState('pending'); const [staffEmail, setStaffEmail] = useState(''); const [refreshing, setRefreshing] = useState(false);
    useEffect(() => { fetchPending(); }, []);
    async function fetchPending() { setRefreshing(true); const { data } = await supabase.from('profiles').select('*').eq('verification_status', 'pending'); setPendingUsers(data || []); setRefreshing(false); }
    async function approveUser(id) { await supabase.from('profiles').update({ verification_status: 'verified' }).eq('id', id); Alert.alert("Approved"); fetchPending(); }
    async function rejectUser(id) { await supabase.from('profiles').update({ verification_status: 'unverified' }).eq('id', id); Alert.alert("Rejected"); fetchPending(); }
    async function promoteToAdmin() { if (!staffEmail) return; const { data: u } = await supabase.from('profiles').select('*').eq('email', staffEmail.trim().toLowerCase()).single(); if(u) { await supabase.from('profiles').update({is_admin:true}).eq('id', u.id); Alert.alert("Success"); setStaffEmail(''); } else Alert.alert("Not Found"); }
    return (
        <SafeAreaView style={styles.homeContainer}>
            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                <Text style={[styles.headerTitle, {color:'#fff'}]}>Admin 🛡️</Text>
            </LinearGradient>
            <View style={{flexDirection:'row', padding:10}}>
                <TouchableOpacity onPress={()=>setActiveTab('pending')} style={[styles.filterChip, activeTab==='pending'&&styles.filterChipActive]}>
                    <Text style={[styles.filterText, activeTab==='pending'&&styles.filterTextActive]}>Verify</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setActiveTab('staff')} style={[styles.filterChip, activeTab==='staff'&&styles.filterChipActive]}>
                    <Text style={[styles.filterText, activeTab==='staff'&&styles.filterTextActive]}>Staff</Text>
                </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{padding:20}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchPending}/>}>
                {activeTab==='pending' ? (
                    pendingUsers.map(u=> (
                        <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={styles.adminCard} key={u.id}>
                            <Text style={{fontWeight:'bold', fontSize:16}}>{u.full_name || u.email}</Text>
                            <Text style={{color:'#718096', marginBottom:10}}>Role: {u.role}</Text>
                            <View style={{flexDirection:'row', marginBottom:10}}>
                                {u.id_card_front ? <Image source={{uri: u.id_card_front}} style={styles.adminThumb}/> : <View style={[styles.adminThumb, {backgroundColor:'#eee'}]}><Text>No Front</Text></View>}
                                {u.id_card_back ? <Image source={{uri: u.id_card_back}} style={styles.adminThumb}/> : <View style={[styles.adminThumb, {backgroundColor:'#eee'}]}><Text>No Back</Text></View>}
                            </View>
                            <View style={{flexDirection:'row', gap:10}}>
                                <LinearGradient colors={['#FF9F1C', '#FFBF69']} style={[styles.selectBtn, {flex:1}]}>
                                    <TouchableOpacity onPress={()=>approveUser(u.id)}>
                                        <Text style={styles.selectBtnText}>Approve</Text>
                                    </TouchableOpacity>
                                </LinearGradient>
                                <LinearGradient colors={['#FF477E', '#FF7096']} style={[styles.selectBtn, {flex:1}]}>
                                    <TouchableOpacity onPress={()=>rejectUser(u.id)}>
                                        <Text style={styles.selectBtnText}>Reject</Text>
                                    </TouchableOpacity>
                                </LinearGradient>
                            </View>
                        </LinearGradient>
                    ))
                ) : (
                    <View>
                        <TextInput style={styles.input} placeholder="Email" value={staffEmail} onChangeText={setStaffEmail}/>
                        <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.primaryBtn}>
                            <TouchableOpacity onPress={promoteToAdmin}>
                                <Text style={styles.primaryBtnText}>Promote</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ==========================================
// 3. WALLET SCREEN
// ==========================================
function WalletScreen({ session, lang }) {
    const [balance, setBalance] = useState(0); const [transactions, setTransactions] = useState([]); const [loading, setLoading] = useState(true); const [showPay, setShowPay] = useState(false);
    useEffect(() => { fetchWallet(); }, []);
    async function fetchWallet() { setLoading(true); const { data: p } = await supabase.from('profiles').select('wallet_balance').eq('id', session.user.id).single(); if (p) setBalance(p.wallet_balance || 0); const { data: t } = await supabase.from('transactions').select('*').eq('specialist_id', session.user.id).order('created_at', { ascending: false }); if (t) setTransactions(t); setLoading(false); }
    return (
        <SafeAreaView style={styles.homeContainer}>
            <Modal visible={showPay} animationType="slide"><PaymentModal session={session} onClose={() => setShowPay(false)} onSuccess={fetchWallet} /></Modal>
            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('wallet')}</Text>
            </LinearGradient>
            <ScrollView contentContainerStyle={{padding: 20}} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchWallet} />}>
                <LinearGradient colors={['#FF477E', '#FF7096']} style={styles.walletCard}>
                    <Text style={{color:'#fff', fontSize:14, opacity:0.8}}>{t('credit_balance')}</Text>
                    <Text style={{color:'#fff', fontSize:36, fontWeight:'bold', marginVertical:10}}>{formatVND(balance)}</Text>
                    <Text style={{color:'#fff', fontSize:12, opacity:0.8}}>{t('keep_positive')}</Text>
                    <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={styles.topUpBtn}>
                        <TouchableOpacity onPress={() => setShowPay(true)}>
                            <Text style={{color:'#FF6B6B', fontWeight:'bold'}}>+ {t('top_up')}</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </LinearGradient>
                <Text style={styles.sectionLabel}>{t('history')}</Text>
                {transactions.map(tx => (
                    <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={styles.transactionItem} key={tx.id}>
                        <View style={[styles.iconCircle, {backgroundColor: tx.amount < 0 ? '#FF477E' : '#FF9F1C'}]}>
                            <Ionicons name={tx.amount < 0 ? "arrow-down" : "arrow-up"} size={16} color="#fff" />
                        </View>
                        <View style={{flex:1, marginLeft:12}}>
                            <Text style={{fontWeight:'bold', color:'#2D3748'}}>{tx.description}</Text>
                            <Text style={{color:'#A0AEC0', fontSize:12}}>{new Date(tx.created_at).toLocaleDateString()}</Text>
                        </View>
                        <Text style={{fontWeight:'bold', color: tx.amount < 0 ? '#FF477E' : '#FF9F1C'}}>{tx.amount < 0 ? '-' : '+'}{formatVND(Math.abs(tx.amount))}</Text>
                    </LinearGradient>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

// ==========================================
// 4. VERIFICATION MODAL
// ==========================================
function VerificationModal({ session, onClose, onUpdate, lang }) {
    const [frontUrl, setFrontUrl] = useState(null); const [backUrl, setBackUrl] = useState(null); const [loading, setLoading] = useState(false);
    async function pickImage(side) { const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true }); if (!res.canceled) uploadID(res.assets[0].base64, side); }
    async function uploadID(base64, side) { setLoading(true); const fileName = `${session.user.id}/id_${side}_${Date.now()}.jpg`; await supabase.storage.from('avatars').upload(fileName, decode(base64), { contentType: 'image/jpeg' }); const { data } = supabase.storage.from('avatars').getPublicUrl(fileName); if (side === 'front') setFrontUrl(data.publicUrl); else setBackUrl(data.publicUrl); setLoading(false); }
    async function submitVerification() { if (!frontUrl || !backUrl) return Alert.alert("Missing Photos"); setLoading(true); await supabase.from('profiles').update({ verification_status: 'pending', id_card_front: frontUrl, id_card_back: backUrl }).eq('id', session.user.id); setLoading(false); Alert.alert("Submitted"); onUpdate(); onClose(); }
    return (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.modalFullOverlay}>
            <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
                <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                    <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
                    <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('verify')}</Text>
                    <View style={{width:24}}/>
                </LinearGradient>
                <ScrollView contentContainerStyle={{padding: 24, alignItems:'center'}}>
                    <Text style={{textAlign:'center', color:'#4A5568', marginBottom:20}}>{t('upload_id_text')}</Text>
                    <Text style={styles.sectionLabel}>Front Side</Text>
                    <TouchableOpacity onPress={() => pickImage('front')} style={styles.idCardUpload}>
                        {frontUrl ? <Image source={{uri:frontUrl}} style={styles.idCardImg}/> : <Ionicons name="camera" size={40} color="#CBD5E0"/>}
                    </TouchableOpacity>
                    <Text style={styles.sectionLabel}>Back Side</Text>
                    <TouchableOpacity onPress={() => pickImage('back')} style={styles.idCardUpload}>
                        {backUrl ? <Image source={{uri:backUrl}} style={styles.idCardImg}/> : <Ionicons name="camera" size={40} color="#CBD5E0"/>}
                    </TouchableOpacity>
                    <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={[styles.primaryBtn, {marginTop:30}]}>
                        <TouchableOpacity onPress={submitVerification} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryBtnText}>Submit</Text>}
                        </TouchableOpacity>
                    </LinearGradient>
                </ScrollView>
            </SafeAreaView>
        </Animated.View>
    );
}

// ==========================================
// 5. SPECIALIST DETAIL MODAL
// ==========================================
function SpecialistDetailModal({ specialist, session, onClose, onHire, lang }) {
    const [reviews, setReviews] = useState([]);
    useEffect(() => { supabase.from('reviews').select('*').eq('specialist_id', specialist.id).neq('comment', '').order('created_at', { ascending: false }).then(({ data }) => setReviews(data || [])); }, []);
    const rankBadge = getRankBadge(specialist.jobs_completed || 0); const isVerified = specialist.verification_status === 'verified';
    return (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.modalFullOverlay}>
            <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
                <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                    <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
                    <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('about')}</Text>
                    <View style={{width:24}}/>
                </LinearGradient>
                <ScrollView contentContainerStyle={{padding: 24}}>
                    <View style={{alignItems:'center', marginBottom:20}}>
                        <Image source={{ uri: specialist.avatar_url || 'https://via.placeholder.com/100' }} style={{width:100, height:100, borderRadius:50, marginBottom:10}} />
                        <Text style={{fontSize:22, fontWeight:'bold', color:'#2D3748'}}>{specialist.full_name}</Text>
                        <View style={{flexDirection:'row', flexWrap:'wrap', justifyContent:'center', gap:8, marginTop:8}}>
                            <LinearGradient colors={[rankBadge.bg, '#FFE5D9']} style={[styles.badgeContainer, {borderColor: rankBadge.border, borderWidth:1}]}>
                                <Ionicons name={rankBadge.icon as any} size={14} color={rankBadge.color} />
                                <Text style={[styles.badgeText, {color:rankBadge.color}]}>{rankBadge.label}</Text>
                            </LinearGradient>
                            {isVerified && (
                                <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={[styles.badgeContainer, {borderColor: '#BEE3F8', borderWidth:1}]}>
                                    <Ionicons name="shield-checkmark" size={14} color="#FF6B6B" />
                                    <Text style={[styles.badgeText, {color:'#FF6B6B'}]}>VERIFIED</Text>
                                </LinearGradient>
                            )}
                        </View>
                    </View>
                    <Text style={styles.sectionLabel}>{t('skills')}</Text>
                    <Text style={{color:'#4A5568', marginBottom:20, fontSize: 16}}>🔧 {specialist.skills || "No skills listed"}</Text>
                    <Text style={styles.sectionLabel}>{t('about')}</Text>
                    <Text style={{color:'#4A5568', marginBottom:20, lineHeight: 20}}>{specialist.bio || "No bio provided."}</Text>
                    {specialist.portfolio_urls && specialist.portfolio_urls.length > 0 && (
                        <>
                            <Text style={styles.sectionLabel}>{t('portfolio')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 20}}>
                                {specialist.portfolio_urls.map((url, i) => (
                                    <Image key={i} source={{uri: url}} style={{width:120, height:120, borderRadius:20, marginRight:10}} />
                                ))}
                            </ScrollView>
                        </>
                    )}
                    <Text style={styles.sectionLabel}>{t('reviews')}</Text>
                    {reviews.length === 0 && <Text style={{color:'#A0AEC0'}}>No reviews yet.</Text>}
                    {reviews.map(r => (
  <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={{padding:12, borderRadius:20, marginBottom:10}} key={r.id}>
    <View style={{flexDirection: 'row', marginBottom: 4}}>
      {[...Array(5)].map((_, i) => (
        <Ionicons key={i} name={i < r.rating ? "star" : "star-outline"} size={16} color="#FFD700" />
      ))}
      <Text style={{marginLeft: 8, fontWeight: 'bold', color: '#FF6B6B'}}>{r.rating.toFixed(1)}</Text>
    </View>
    <Text style={{color:'#2D3748'}}>{r.comment}</Text>
  </LinearGradient>
))}
                    <View style={{height:40}}/>
                </ScrollView>
                <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={{padding:20, borderTopWidth:1, borderColor:'#EDF2F7'}}>
                    <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.selectBtn}>
                        <TouchableOpacity onPress={onHire}>
                            <Text style={styles.selectBtnText}>{t('hire_for')} {formatVND(specialist.base_price_vnd)}</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </LinearGradient>
            </SafeAreaView>
        </Animated.View>
    );
}

// ==========================================
// 6. REVIEW MODAL
// ==========================================
function ReviewModal({ job, onClose, onSuccess, lang }) {
    const [rating, setRating] = useState(5); const [comment, setComment] = useState('');
    async function submit() { await supabase.from('reviews').insert([{ job_id: job.id, specialist_id: job.specialist_id, rating, comment }]); await supabase.from('jobs').update({ client_has_reviewed: true }).eq('id', job.id); onSuccess(job.id); onClose(); }
    return (
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1, justifyContent:'center'}}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.modalOverlay}>
                    <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('rate_review')}</Text>
                        <TextInput style={[styles.input, styles.textArea]} placeholder="Comment..." value={comment} onChangeText={setComment} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
                        <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.primaryBtn}>
                            <TouchableOpacity onPress={submit}>
                                <Text style={styles.primaryBtnText}>Submit</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                        <TouchableOpacity onPress={onClose} style={{marginTop:15}}>
                            <Text>Cancel</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </Animated.View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

// ==========================================
// 7. CHAT SCREEN
// ==========================================
function ChatScreen({ job, session, onClose, lang }) {
    const [msg, setMsg] = useState(''); const [list, setList] = useState([]);
    const flatListRef = useRef(null);
    useEffect(() => {
        supabase.from('messages').select('*').eq('job_id', job.id).then(({data}) => setList(data||[]));
        const sub = supabase.channel(`chat_${job.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `job_id=eq.${job.id}` }, (payload) => { setList(p => [...p, payload.new]); flatListRef.current?.scrollToEnd({animated: true}); }).subscribe();
        return () => sub.unsubscribe();
    }, []);
    async function send() { 
        if(!msg) return; 
        await supabase.from('messages').insert([{job_id:job.id, sender_id:session.user.id, content:msg, message_type:'text'}]); 
        setMsg(''); 
        flatListRef.current?.scrollToEnd({animated: true}); 
        
        // NEW: Generate notification for recipient
        const recipientId = session.user.id === job.client_id ? job.specialist_id : job.client_id;  // Determine recipient (opposite of sender)
        const { data: senderData } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single();
        const senderName = senderData?.full_name || 'a user';  // Fetch sender name or fallback
        await supabase.from('notifications').insert([{ 
            user_id: recipientId, 
            type: 'message', 
            message: `New message from ${senderName} in job chat` 
        }]);
    }
    async function sendPhoto() { const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true }); if (res.canceled) return; const fileName = `chat/${job.id}/${Date.now()}.jpg`; await supabase.storage.from('avatars').upload(fileName, decode(res.assets[0].base64), { contentType: 'image/jpeg' }); const { data } = supabase.storage.from('avatars').getPublicUrl(fileName); await supabase.from('messages').insert([{ job_id: job.id, sender_id: session.user.id, content: 'Photo', message_type: 'image', image_url: data.publicUrl }]); }
    return (
        <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#fff"/></TouchableOpacity>
                <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('chat')}</Text>
                <View style={{width:24}}/>
            </LinearGradient>
            <FlatList ref={flatListRef} data={list} onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})} renderItem={({item}) => (
                <View style={{alignSelf: item.sender_id === session.user.id ? 'flex-end' : 'flex-start', margin:5}}>
                    {item.message_type==='image' ? (
                        <Image source={{uri:item.image_url}} style={{width:200, height:200, borderRadius:20}}/>
                    ) : (
                        <LinearGradient colors={item.sender_id === session.user.id ? ['#FF6B6B', '#FFE66D'] : ['#FFE5D9', '#FFDAB9']} style={{padding:10, borderRadius:20}}>
                            <Text style={{color:item.sender_id === session.user.id?'#fff':'#2D3748'}}>{item.content}</Text>
                        </LinearGradient>
                    )}
                    <Text style={{fontSize: 10, color: '#A0AEC0', textAlign: item.sender_id === session.user.id ? 'right' : 'left', marginTop: 2}}>
                        {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </Text>
                </View>
            )} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={10}>
                <View style={styles.chatInputContainer}>
                    <TouchableOpacity onPress={sendPhoto}><Ionicons name="camera" size={24} color="#A0AEC0"/></TouchableOpacity>
                    <TextInput style={styles.chatInput} value={msg} onChangeText={setMsg} />
                    <TouchableOpacity onPress={send}><Ionicons name="send" size={24} color="#3182CE"/></TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ==========================================
// NOTIFICATIONS SCREEN
// ==========================================
function NotificationsScreen({ session, lang }) {
    const [notifications, setNotifications] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const flatListRef = useRef(null);

    useEffect(() => {
        fetchNotifications();
        const sub = supabase
            .channel('notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${session.user.id}`
                },
                (payload) => {
                    setNotifications((prev) => [payload.new, ...prev]);
                    flatListRef.current?.scrollToEnd({ animated: true });
                }
            )
            .subscribe();

        return () => sub.unsubscribe();
    }, []);

    async function fetchNotifications() {
        setRefreshing(true);
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
        setNotifications(data || []);
        setRefreshing(false);
    }

    async function markAsRead(id) {
        await supabase.from('notifications').update({ read: true }).eq('id', id);
        fetchNotifications();
    }

    return (
        <SafeAreaView style={styles.homeContainer}>
            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                <Text style={[styles.headerTitle, { color: '#fff' }]}>{t('notifications')}</Text>
            </LinearGradient>

            <FlatList
                ref={flatListRef}
                data={notifications}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchNotifications} />}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ padding: 20 }}
                ListEmptyComponent={
                    <Text style={{ textAlign: 'center', color: '#A0AEC0', marginTop: 50 }}>
                        {t('no_notifications')}
                    </Text>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        onPress={() => markAsRead(item.id)}
                        style={{
                            padding: 16,
                            backgroundColor: item.read ? '#FFE5D9' : '#FFDAB9',
                            borderRadius: 20,
                            marginBottom: 10
                        }}
                    >
                        <Text style={{ fontWeight: item.read ? 'normal' : 'bold', color: '#2D3748' }}>
                            {item.message}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#A0AEC0', marginTop: 4 }}>
                            {new Date(item.created_at).toLocaleString()}
                        </Text>
                    </TouchableOpacity>
                )}
            />
        </SafeAreaView>
    );
}

// ==========================================
// 8. BOOKING SCREEN
// ==========================================
function BookingScreen({ category, specialist, onClose, session, userLocation, lang }) {
    const [address, setAddress] = useState(''); const [details, setDetails] = useState('');
    const lat = userLocation?.coords?.latitude||10.7769; const lon = userLocation?.coords?.longitude||106.7009;
    const basePrice = specialist?.base_price_vnd||100000; const travelFee = (specialist?.travel_fee_per_km||5000)*2.5;
    async function book() { if(!address) return; await supabase.from('jobs').insert([{client_id:session.user.id, category:category?.name||'General', address, description:details, price_estimate:formatVND(basePrice+travelFee), status:specialist?'in_progress':'open', specialist_id:specialist?.id, latitude:lat, longitude:lon}]); Alert.alert("Success"); onClose(); }
    return (
        <SafeAreaView style={styles.bookingContainer}>
            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                <TouchableOpacity onPress={onClose}><Ionicons name="arrow-back" size={24} color="#fff"/></TouchableOpacity>
                <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('book')}</Text>
                <View style={{width:24}}/>
            </LinearGradient>
            <ScrollView contentContainerStyle={{padding:24}} keyboardDismissMode="on-drag">
                <Text style={styles.sectionLabel}>{t('est_cost')}</Text>
                <LinearGradient colors={['#FF477E', '#FF7096']} style={styles.walletCard}>
                    <Text style={{color:'#fff'}}>{t('total')}: {formatVND(basePrice+travelFee)}</Text>
                </LinearGradient>
                <Text style={styles.sectionLabel}>{t('address')}</Text>
                <TextInput style={styles.input} value={address} onChangeText={setAddress} returnKeyType="done"/>
                <Text style={styles.sectionLabel}>{t('details')}</Text>
                <TextInput style={styles.input} value={details} onChangeText={setDetails}/>
                <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.primaryBtn}>
                    <TouchableOpacity onPress={book}>
                        <Text style={styles.primaryBtnText}>{t('confirm')}</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </ScrollView>
        </SafeAreaView>
    );
}

// ==========================================
// 9. PROFILE SCREEN
// ==========================================
function ProfileScreen({ session, onClose, userRole, onUpdate, setLang, lang }) {
    const [loading, setLoading] = useState(false); const [fullName, setFullName] = useState(''); const [avatarUrl, setAvatarUrl] = useState(null); const [bio, setBio] = useState(''); const [skills, setSkills] = useState(''); const [portfolioUrls, setPortfolioUrls] = useState([]); const [basePrice, setBasePrice] = useState('100000'); const [verificationStatus, setVerificationStatus] = useState('unverified'); const [showVerify, setShowVerify] = useState(false); const [jobsCompleted, setJobsCompleted] = useState(0);
    useEffect(() => { getProfile(); }, []);
    async function getProfile() { const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single(); if (data) { setFullName(data.full_name||''); setAvatarUrl(data.avatar_url); setBio(data.bio||''); setSkills(data.skills||''); setPortfolioUrls(data.portfolio_urls||[]); setBasePrice(data.base_price_vnd?.toString()||'100000'); setVerificationStatus(data.verification_status||'unverified'); setJobsCompleted(data.jobs_completed || 0); } }
    async function update() { setLoading(true); await supabase.from('profiles').update({ full_name: fullName, bio, skills, portfolio_urls: portfolioUrls, base_price_vnd: parseInt(basePrice) }).eq('id', session.user.id); setLoading(false); Alert.alert("Saved"); if (onUpdate) onUpdate(); }
    async function pickImage(isPortfolio) { const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.5 }); if (!res.canceled) { const file = `${session.user.id}/${Date.now()}.jpg`; await supabase.storage.from('avatars').upload(file, decode(res.assets[0].base64), { contentType: 'image/jpeg' }); const { data } = supabase.storage.from('avatars').getPublicUrl(file); if(isPortfolio) { const p = [...portfolioUrls, data.publicUrl]; await supabase.from('profiles').update({ portfolio_urls: p }).eq('id', session.user.id); setPortfolioUrls(p); } else { await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', session.user.id); setAvatarUrl(data.publicUrl); onUpdate(); } } }
    const rankBadge = getRankBadge(jobsCompleted);
    return (
        <SafeAreaView style={styles.homeContainer}>
            <Modal visible={showVerify} animationType="slide"><VerificationModal session={session} onClose={() => setShowVerify(false)} onUpdate={getProfile} lang={lang} /></Modal>
            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                <TouchableOpacity onPress={onClose}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
                <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('edit_profile')}</Text>
                <View style={{width:24}}/>
            </LinearGradient>
            <ScrollView contentContainerStyle={styles.bookingContent} keyboardDismissMode="on-drag">
                <View style={{alignItems:'center', marginBottom: 30}}>
                    <TouchableOpacity onPress={() => pickImage(false)} style={styles.avatarContainer}>
                        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Ionicons name="person" size={50} color="#CBD5E0" />}
                    </TouchableOpacity>
                    <Text style={styles.roleTag}>{userRole}</Text>
                    <View style={{flexDirection:'row', flexWrap:'wrap', justifyContent:'center', gap:8, marginTop:8}}>
                        <LinearGradient colors={[rankBadge.bg, '#FFE5D9']} style={[styles.badgeContainer, {borderColor: rankBadge.border, borderWidth:1}]}>
                            <Ionicons name={rankBadge.icon as any} size={14} color={rankBadge.color} />
                            <Text style={[styles.badgeText, {color:rankBadge.color}]}>{rankBadge.label}</Text>
                        </LinearGradient>
                        {userRole === 'specialist' && verificationStatus === 'verified' && (
                            <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={[styles.badgeContainer, {borderColor: '#BEE3F8', borderWidth:1}]}>
                                <Ionicons name="shield-checkmark" size={14} color="#FF6B6B" />
                                <Text style={[styles.badgeText, {color:'#FF6B6B'}]}>VERIFIED</Text>
                            </LinearGradient>
                        )}
                    </View>
                </View>
                <View style={{flexDirection:'row', justifyContent:'center', marginBottom: 20}}>
                    <TouchableOpacity onPress={() => setLang('en')} style={[styles.filterChip, currentLang==='en' && styles.filterChipActive]}>
                        <Text style={[styles.filterText, currentLang==='en' && styles.filterTextActive]}>English</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setLang('vn')} style={[styles.filterChip, currentLang==='vn' && styles.filterChipActive]}>
                        <Text style={[styles.filterText, currentLang==='vn' && styles.filterTextActive]}>Tiếng Việt</Text>
                    </TouchableOpacity>
                </View>
                {userRole === 'specialist' && verificationStatus !== 'verified' && (
                    <LinearGradient colors={['#FF9F1C', '#FFBF69']} style={styles.verifyBtn}>
                        <TouchableOpacity onPress={() => setShowVerify(true)}>
                            <Ionicons name="scan" size={20} color="#fff" />
                            <Text style={styles.verifyBtnText}>{verificationStatus === 'pending' ? t('pending') : t('verify')}</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                )}
                <Text style={styles.sectionLabel}>Name</Text>
                <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />
                {userRole === 'specialist' && (
                    <>
                        <Text style={styles.sectionLabel}>{t('pricing')} (VND)</Text>
                        <TextInput style={styles.input} value={basePrice} onChangeText={setBasePrice} keyboardType="numeric" />
                        <Text style={styles.sectionLabel}>{t('skills')}</Text>
                        <TextInput style={styles.input} value={skills} onChangeText={setSkills} />
                        <Text style={styles.sectionLabel}>{t('about')}</Text>
                        <TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio} multiline />
                        <Text style={styles.sectionLabel}>{t('portfolio')}</Text>
                        <ScrollView horizontal style={{marginBottom: 20}}>
                            <TouchableOpacity style={styles.addPortfolioBtn} onPress={() => pickImage(true)}>
                                <Ionicons name="add" size={30} color="#A0AEC0" />
                            </TouchableOpacity>
                            {portfolioUrls.map((u, i) => (
                                <Image key={i} source={{uri: u}} style={styles.portfolioThumb} />
                            ))}
                        </ScrollView>
                    </>
                )}
                <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.primaryBtn}>
                    <TouchableOpacity onPress={update} disabled={loading}>
                        <Text style={styles.primaryBtnText}>{t('save')}</Text>
                    </TouchableOpacity>
                </LinearGradient>
                <LinearGradient colors={['#FF477E', '#FF7096']} style={[styles.primaryBtn, {marginTop: 12}]}>
                    <TouchableOpacity onPress={() => supabase.auth.signOut()}>
                        <Text style={styles.primaryBtnText}>{t('logout')}</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </ScrollView>
        </SafeAreaView>
    );
}

// ==========================================
// 10. BROWSE SPECIALISTS SCREEN
// ==========================================
function BrowseSpecialistsScreen({ session, onClose, userLocation, lang }) {
    const [specialists, setSpecialists] = useState([]); const [selectedSpec, setSelectedSpec] = useState(null); const [bookingSpec, setBookingSpec] = useState(null); const [refreshing, setRefreshing] = useState(false); const [viewMode, setViewMode] = useState('list');
    useEffect(() => { fetchSpecialists(); }, []);
    async function fetchSpecialists() { setRefreshing(true); const { data } = await supabase.from('profiles').select('*').eq('role', 'specialist'); if (data) setSpecialists(data); setRefreshing(false); }
    const mapRegion = { latitude: userLocation?.coords?.latitude || 10.7769, longitude: userLocation?.coords?.longitude || 106.7009, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    return (
        <SafeAreaView style={styles.homeContainer}>
            <Modal visible={selectedSpec !== null} animationType="slide">
                {selectedSpec && <SpecialistDetailModal specialist={selectedSpec} session={session} onClose={() => setSelectedSpec(null)} onHire={() => { setBookingSpec(selectedSpec); setSelectedSpec(null); }} lang={lang} />}
            </Modal>
            <Modal visible={bookingSpec !== null} animationType="slide">
                {bookingSpec && <BookingScreen specialist={bookingSpec} session={session} onClose={() => setBookingSpec(null)} userLocation={userLocation} lang={lang} />}
            </Modal>
            <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.headerBar}>
                <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
                <Text style={[styles.headerTitle, {color:'#fff'}]}>{t('find_specialist')}</Text>
                <TouchableOpacity onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')} style={{backgroundColor:'#FFE5D9', padding:8, borderRadius:30}}>
                    <Ionicons name={viewMode === 'list' ? "map" : "list"} size={20} color="#FF6B6B" />
                </TouchableOpacity>
            </LinearGradient>
            {viewMode === 'list' ? (
                <FlatList
                    data={specialists}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{padding: 16}}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchSpecialists} />}
                    renderItem={({item}) => {
                        const dist = calculateDistance(userLocation?.coords?.latitude, userLocation?.coords?.longitude, item.latitude, item.longitude);
                        const rankBadge = getRankBadge(item.jobs_completed || 0);
                        const isVerified = item.verification_status === 'verified';
                        return (
                            <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={styles.taskerCard}>
                                <View style={styles.taskerHeader}>
                                    <Image source={{ uri: item.avatar_url || 'https://via.placeholder.com/100' }} style={styles.taskerAvatar} />
                                    <View style={{flex:1, marginLeft: 12}}>
                                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                            <Text style={styles.taskerName}>{item.full_name || 'Specialist'}</Text>
                                            <View style={{flexDirection:'row', gap:4}}>
                                                <LinearGradient colors={[rankBadge.bg, '#FFE5D9']} style={[styles.miniBadge, {borderColor: rankBadge.border, borderWidth: 1}]}>
                                                    <Text style={[styles.miniBadgeText, {color: rankBadge.color}]}>{rankBadge.label}</Text>
                                                </LinearGradient>
                                                {isVerified && (
                                                    <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={[styles.miniBadge, {borderColor: '#BEE3F8', borderWidth: 1}]}>
                                                        <Text style={[styles.miniBadgeText, {color: '#FF6B6B'}]}>VERIFIED</Text>
                                                    </LinearGradient>
                                                )}
                                            </View>
                                        </View>
                                        <Text style={styles.taskerRate}>{formatVND(item.base_price_vnd || 100000)}</Text>
                                        <View style={{flexDirection:'row', marginTop: 4}}>
                                            <Ionicons name="star" size={14} color="#FFD700" />
                                            <Text style={{fontWeight:'bold', marginLeft:4}}>{(item.review_average || 5.0).toFixed(1)}</Text>
                                            <Text style={{color:'#CBD5E0', marginHorizontal:6}}>|</Text>
                                            <Ionicons name="location-outline" size={14} color="#FF9F1C" />
                                            <Text style={{color:'#FF9F1C', marginLeft:4, fontWeight:'bold'}}>{dist} km</Text>
                                        </View>
                                    </View>
                                </View>
                                <LinearGradient colors={['#FFDAB9', '#FFE5D9']} style={styles.taskerBody}>
                                    <Text style={styles.taskerSkills} numberOfLines={1}>🔧 {item.skills || 'General Help'}</Text>
                                    <Text style={styles.taskerBio} numberOfLines={2}>{item.bio || 'Tap to view details...'}</Text>
                                </LinearGradient>
                                <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.selectBtn}>
                                    <TouchableOpacity onPress={() => setSelectedSpec(item)}>
                                        <Text style={styles.selectBtnText}>{t('view_profile')}</Text>
                                    </TouchableOpacity>
                                </LinearGradient>
                            </LinearGradient>
                        );
                    }}
                />
            ) : (
                <View style={{flex:1}}>
                    <MapView style={{width: '100%', height: '100%'}} initialRegion={mapRegion} showsUserLocation={true}>
                        {specialists.map(item => (
                            <Marker key={item.id} coordinate={{latitude: item.latitude || 10.7769, longitude: item.longitude || 106.7009}} title={item.full_name} description={formatVND(item.base_price_vnd || 100000)} onPress={() => setSelectedSpec(item)}>
                                <View style={styles.mapMarker}>
                                    <Image source={{ uri: item.avatar_url || 'https://via.placeholder.com/100' }} style={styles.mapAvatar} />
                                    <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.mapBadge}>
                                        <Ionicons name="star" size={8} color="#fff"/>
                                        <Text style={styles.mapScore}>{(item.review_average || 5.0).toFixed(1)}</Text>
                                    </LinearGradient>
                                </View>
                            </Marker>
                        ))}
                    </MapView>
                    <LinearGradient colors={['rgba(255,213,189,0.9)', '#FFE5D9']} style={styles.mapOverlay}>
                        <Text style={{fontWeight:'bold', color:'#2D3748'}}>Tap a pin to view profile</Text>
                    </LinearGradient>
                </View>
            )}
        </SafeAreaView>
    );
}

// ==========================================
// 11. CLIENT HOME SCREEN – RESTORED
// ==========================================
function ClientHomeScreen({ session, lang, setLang }) {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedJobForChat, setSelectedJobForChat] = useState(null);
  const [selectedJobForReview, setSelectedJobForReview] = useState(null);
  const [myJobs, setMyJobs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [location, setLocation] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchProfileData();
    updateLocation();
    fetchMyJobs();
    
    registerForPushNotificationsAsync();
    const fetchUnread = async () => {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('read', false);
      setUnreadCount(count || 0);
    };
    fetchUnread();
    const channel = supabase.channel('notifications_client').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, (payload) => {
        fetchUnread();
        Notifications.scheduleNotificationAsync({ content: { title: "New Message!", body: payload.new.message || "You have a new notification", sound: true }, trigger: null });
    }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [session.user.id]);

  async function registerForPushNotificationsAsync() {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await supabase.from('profiles').update({ push_token: token }).eq('id', session.user.id);
  }

  // --- RESTORED FUNCTIONS ---
  async function fetchProfileData() {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (data) {
      setDisplayName(data.full_name || data.email);
      setAvatarUrl(data.avatar_url);
    }
  }

  async function updateLocation() {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    let location = await Location.getCurrentPositionAsync({});
    setLocation(location);
    await supabase.from('profiles').update({ latitude: location.coords.latitude, longitude: location.coords.longitude }).eq('id', session.user.id);
  }

  async function fetchMyJobs() {
    setRefreshing(true);
    const { data } = await supabase.from('jobs').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false });
    setMyJobs(data || []);
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.homeContainer}>
      {/* Modals */}
      <Modal visible={showProfile} animationType="slide">
        <ProfileScreen session={session} userRole="client" onClose={() => setShowProfile(false)} onUpdate={fetchProfileData} setLang={setLang} lang={lang} />
      </Modal>
      <Modal visible={showBrowser} animationType="slide">
        <BrowseSpecialistsScreen session={session} onClose={() => setShowBrowser(false)} userLocation={location} lang={lang} />
      </Modal>
      <Modal visible={selectedCategory !== null} animationType="slide">
        <BookingScreen category={selectedCategory} session={session} onClose={() => { setSelectedCategory(null); fetchMyJobs(); }} userLocation={location} lang={lang} />
      </Modal>
      <Modal visible={selectedJobForChat !== null} animationType="slide">
        {selectedJobForChat && <ChatScreen job={selectedJobForChat} session={session} onClose={() => setSelectedJobForChat(null)} lang={lang} />}
      </Modal>
      <Modal visible={selectedJobForReview !== null} animationType="slide">
        {selectedJobForReview && <ReviewModal job={selectedJobForReview} onClose={() => setSelectedJobForReview(null)} onSuccess={fetchMyJobs} lang={lang} />}
      </Modal>

      {/* Header */}
      <View style={{padding:20, paddingTop:10}}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
          <View>
            <Text style={styles.greeting}>{t('greeting')}</Text>
            <Text style={styles.username}>{displayName || 'Client'}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowProfile(true)}>
            {avatarUrl ? <Image source={{uri:avatarUrl}} style={{width:50, height:50, borderRadius:25}}/> : <Ionicons name="person-circle" size={50} color="#FF6B6B"/>}
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'home' && (
        <ScrollView contentContainerStyle={{paddingBottom:80}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMyJobs}/>}>
          {/* Banner */}
          <LinearGradient colors={['#FF6B6B', '#FF8E53']} style={styles.banner}>
            <View style={styles.bannerTextContainer}>
              <Text style={styles.bannerTitle}>{t('find_specialist')}</Text>
              <Text style={styles.bannerSubtitle}>Cleaning, Repairs, Moving & more.</Text>
              <TouchableOpacity style={styles.bannerBtn} onPress={() => setShowBrowser(true)}>
                <Text style={styles.bannerBtnText}>{t('browse')}</Text>
              </TouchableOpacity>
            </View>
            <Ionicons name="search" size={100} color="rgba(255,255,255,0.2)" style={styles.bannerIcon} />
          </LinearGradient>

          {/* Categories */}
          <Text style={styles.sectionTitle}>{t('services')}</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat.id} style={[styles.categoryCard, {backgroundColor: cat.color}]} onPress={() => setSelectedCategory(cat)}>
                <Image source={{uri: cat.image}} style={{width:'100%', height:'100%', position:'absolute'}} resizeMode="cover" opacity={0.2} />
                <View style={{padding:16, alignItems:'center', justifyContent:'center', height:'100%'}}>
                  <View style={[styles.iconContainer, {backgroundColor:'#fff'}]}>
                    <Ionicons name={cat.icon as any} size={30} color={cat.iconColor} />
                  </View>
                  <Text style={styles.categoryName}>{currentLang === 'vn' ? cat.vnName : cat.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {activeTab === 'activity' && (
        <ScrollView contentContainerStyle={{padding:20}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMyJobs}/>}>
          <Text style={styles.pageTitle}>{t('my_activity')}</Text>
          {myJobs.length === 0 && <Text style={{color:'#A0AEC0', textAlign:'center', marginTop:20}}>{t('no_jobs')}</Text>}
          {myJobs.map(job => (
            <LinearGradient colors={['#FFFFFF', '#FFF5F5']} style={styles.jobCard} key={job.id}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobCategory}>{job.category}</Text>
                <View style={[styles.statusBadge, job.status==='completed'?styles.statusGreen:job.status==='in_progress'?styles.statusBlue:styles.statusYellow]}>
                  <Text style={styles.statusText}>{job.status}</Text>
                </View>
              </View>
              <Text style={styles.jobPrice}>{job.price_estimate}</Text>
              <Text style={styles.jobAddress} numberOfLines={1}>{job.address}</Text>
              <View style={{flexDirection:'row', justifyContent:'flex-end', marginTop:10, gap:10}}>
                {job.status !== 'open' && (
                  <TouchableOpacity onPress={() => setSelectedJobForChat(job)} style={styles.chatBtnOutline}>
                    <Ionicons name="chatbubble-ellipses" size={18} color="#FF6B6B"/>
                    <Text style={styles.chatBtnText}>{t('chat')}</Text>
                  </TouchableOpacity>
                )}
                {job.status === 'completed' && !job.client_has_reviewed && (
                  <TouchableOpacity onPress={() => setSelectedJobForReview(job)} style={styles.chatBtnOutline}>
                    <Ionicons name="star" size={18} color="#FF6B6B"/>
                    <Text style={styles.chatBtnText}>{t('rate_review')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </LinearGradient>
          ))}
        </ScrollView>
      )}

      {activeTab === 'notifications' && <NotificationsScreen session={session} lang={lang} />}

      {/* Bottom Nav */}
      <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('home')}>
          <Ionicons name="home" size={24} color={activeTab==='home'?"#FF6B6B":"#A0AEC0"}/>
          <Text style={[styles.navText, activeTab==='home'&&styles.navTextActive]}>{t('home')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('activity')}>
          <Ionicons name="list" size={24} color={activeTab==='activity'?"#FF6B6B":"#A0AEC0"}/>
          <Text style={[styles.navText, activeTab==='activity'&&styles.navTextActive]}>{t('activity')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('notifications')}>
          <View>
            <Ionicons name="notifications" size={24} color={activeTab==='notifications'?"#FF6B6B":"#A0AEC0"}/>
            {unreadCount > 0 && <View style={{position:'absolute', top:-6, right:-6, backgroundColor:'red', width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center'}}><Text style={{color:'#fff', fontSize:10, fontWeight:'bold'}}>{unreadCount}</Text></View>}
          </View>
          <Text style={[styles.navText, activeTab==='notifications'&&styles.navTextActive]}>{t('notifications')}</Text>
        </TouchableOpacity>
      </LinearGradient>
    </SafeAreaView>
  );
}

// ==========================================
// 12. SPECIALIST HOME SCREEN – RESTORED
// ==========================================
function SpecialistHomeScreen({ session, lang, setLang }) {
    const [activeTab, setActiveTab] = useState('marketplace');
    const [jobs, setJobs] = useState([]); 
    const [myJobs, setMyJobs] = useState([]); 
    const [refreshing, setRefreshing] = useState(false); 
    const [showProfile, setShowProfile] = useState(false); 
    const [displayName, setDisplayName] = useState(''); 
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [location, setLocation] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [selectedJobForChat, setSelectedJobForChat] = useState(null);

    // ── PUSH NOTIFICATIONS + UNREAD BADGE ─────────────────────
    useEffect(() => {
        registerForPushNotificationsAsync();
        const fetchUnread = async () => {
            const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('read', false);
            setUnreadCount(count || 0);
        };
        fetchUnread();
        const channel = supabase.channel('notifications_specialist').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, (payload) => {
            fetchUnread();
            Notifications.scheduleNotificationAsync({ content: { title: "New Message!", body: payload.new.message || "You have a new notification", sound: true }, trigger: null });
        }).subscribe();
        return () => supabase.removeChannel(channel);
    }, [session.user.id]);

    async function registerForPushNotificationsAsync() {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        await supabase.from('profiles').update({ push_token: token }).eq('id', session.user.id);
    }

    // ── RESTORED FUNCTIONS ──────────────────────────────
    useEffect(() => {
        fetchProfileData();
        updateLocation();
        supabase.from('profiles').select('is_admin').eq('id', session.user.id).single().then(({ data }) => setIsAdmin(data?.is_admin || false));
    }, []);

    useEffect(() => {
        if (activeTab === 'marketplace') fetchMarketplace();
        if (activeTab === 'schedule') fetchMySchedule();
    }, [activeTab]);

    async function fetchProfileData() {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (data) {
            setDisplayName(data.full_name || data.email);
            setAvatarUrl(data.avatar_url);
        }
    }

    async function updateLocation() {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        let location = await Location.getCurrentPositionAsync({});
        setLocation(location);
        await supabase.from('profiles').update({ latitude: location.coords.latitude, longitude: location.coords.longitude }).eq('id', session.user.id);
    }

    async function fetchMarketplace() {
        setRefreshing(true);
        let query = supabase.from('jobs').select('*').eq('status', 'open').order('created_at', { ascending: false });
        const { data } = await query;
        setJobs(data || []);
        setRefreshing(false);
    }

    async function fetchMySchedule() {
        setRefreshing(true);
        const { data } = await supabase.from('jobs').select('*').eq('specialist_id', session.user.id).neq('status', 'open').order('created_at', { ascending: false });
        setMyJobs(data || []);
        setRefreshing(false);
    }

    async function acceptJob(jobId) {
        await supabase.from('jobs').update({ status: 'in_progress', specialist_id: session.user.id }).eq('id', jobId);
        fetchMarketplace();
        Alert.alert("Job Accepted", "Please check your schedule.");
    }

    async function completeJob(jobId) {
        await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId);
        fetchMySchedule();
        Alert.alert("Job Completed", "Payment pending.");
    }

    return (
        <SafeAreaView style={styles.homeContainer}>
            <Modal visible={selectedJobForChat !== null} animationType="slide">
                {selectedJobForChat && <ChatScreen job={selectedJobForChat} session={session} onClose={() => setSelectedJobForChat(null)} lang={lang} />}
            </Modal>
            <Modal visible={showProfile} animationType="slide">
                <ProfileScreen session={session} userRole="specialist" onClose={() => setShowProfile(false)} onUpdate={fetchProfileData} setLang={setLang} lang={lang} />
            </Modal>

            {/* Header */}
            <View style={{padding:20, paddingTop:10, flexDirection:'row', justifyContent:'space-between'}}>
                <View>
                    <Text style={styles.greeting}>{t('greeting')}</Text>
                    <Text style={styles.username}>{displayName || 'Specialist'}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowProfile(true)}>
                    {avatarUrl ? <Image source={{uri:avatarUrl}} style={{width:50, height:50, borderRadius:25}}/> : <Ionicons name="person-circle" size={50} color="#FF6B6B"/>}
                </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
                {activeTab === 'marketplace' && (
                    <FlatList
                        data={jobs}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMarketplace}/>}
                        contentContainerStyle={{padding:20}}
                        ListEmptyComponent={<Text style={{textAlign:'center', color:'#A0AEC0'}}>{t('no_jobs')}</Text>}
                        renderItem={({item}) => {
                            const dist = calculateDistance(location?.coords?.latitude, location?.coords?.longitude, item.latitude, item.longitude);
                            return (
                                <LinearGradient colors={['#FFFFFF', '#FFF5F5']} style={styles.jobCard}>
                                    <View style={styles.jobHeader}>
                                        <Text style={styles.jobCategory}>{item.category}</Text>
                                        <Text style={styles.jobPrice}>{item.price_estimate}</Text>
                                    </View>
                                    <Text style={styles.jobAddress}><Ionicons name="location" size={14}/> {item.address} ({dist} km)</Text>
                                    <Text style={styles.jobDesc}>{item.description}</Text>
                                    <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.acceptBtn}>
                                        <TouchableOpacity onPress={() => acceptJob(item.id)}>
                                            <Text style={styles.acceptBtnText}>{t('accept')}</Text>
                                        </TouchableOpacity>
                                    </LinearGradient>
                                </LinearGradient>
                            );
                        }}
                    />
                )}

                {activeTab === 'schedule' && (
                    <FlatList
                        data={myJobs}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMySchedule}/>}
                        contentContainerStyle={{padding:20}}
                        renderItem={({item}) => (
                            <LinearGradient colors={['#FFFFFF', '#FFF5F5']} style={styles.jobCard}>
                                <View style={styles.jobHeader}>
                                    <Text style={styles.jobCategory}>{item.category}</Text>
                                    <View style={[styles.statusBadge, item.status==='completed'?styles.statusGreen:styles.statusBlue]}>
                                        <Text style={styles.statusText}>{item.status}</Text>
                                    </View>
                                </View>
                                <Text style={styles.jobAddress}>{item.address}</Text>
                                <View style={{flexDirection:'row', gap:10, marginTop:10}}>
                                    <TouchableOpacity onPress={() => setSelectedJobForChat(item)} style={[styles.chatBtnOutline, {flex:1}]}>
                                        <Ionicons name="chatbubble" size={18} color="#FF6B6B"/>
                                        <Text style={styles.chatBtnText}>{t('chat')}</Text>
                                    </TouchableOpacity>
                                    {item.status === 'in_progress' && (
                                        <TouchableOpacity onPress={() => completeJob(item.id)} style={[styles.chatBtnOutline, {flex:1, borderColor:'#38A169'}]}>
                                            <Ionicons name="checkmark-circle" size={18} color="#38A169"/>
                                            <Text style={[styles.chatBtnText, {color:'#38A169'}]}>{t('complete')}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </LinearGradient>
                        )}
                    />
                )}

                {activeTab === 'wallet' && <WalletScreen session={session} lang={lang} />}
                {activeTab === 'notifications' && <NotificationsScreen session={session} lang={lang} />}
                {activeTab === 'admin' && <AdminScreen />}
            </View>

            {/* Bottom Nav */}
            <LinearGradient colors={['#FFE5D9', '#FFDAB9']} style={styles.bottomNav}>
                <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('marketplace')}>
                    <Ionicons name="briefcase" size={24} color={activeTab==='marketplace'?"#FF6B6B":"#A0AEC0"}/>
                    <Text style={[styles.navText, activeTab==='marketplace'&&styles.navTextActive]}>{t('market')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('schedule')}>
                    <Ionicons name="calendar" size={24} color={activeTab==='schedule'?"#FF6B6B":"#A0AEC0"}/>
                    <Text style={[styles.navText, activeTab==='schedule'&&styles.navTextActive]}>{t('schedule')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('wallet')}>
                    <Ionicons name="wallet" size={24} color={activeTab==='wallet'?"#FF6B6B":"#A0AEC0"}/>
                    <Text style={[styles.navText, activeTab==='wallet'&&styles.navTextActive]}>{t('wallet')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('notifications')}>
                    <View>
                        <Ionicons name="notifications" size={24} color={activeTab==='notifications'?"#FF6B6B":"#A0AEC0"}/>
                        {unreadCount > 0 && <View style={{position:'absolute', top:-6, right:-6, backgroundColor:'red', width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center'}}><Text style={{color:'#fff', fontSize:10, fontWeight:'bold'}}>{unreadCount}</Text></View>}
                    </View>
                    <Text style={[styles.navText, activeTab==='notifications'&&styles.navTextActive]}>{t('notifications')}</Text>
                </TouchableOpacity>
                {isAdmin && (
                    <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('admin')}>
                        <Ionicons name="shield" size={24} color={activeTab==='admin'?"#FF6B6B":"#A0AEC0"}/>
                        <Text style={[styles.navText, activeTab==='admin'&&styles.navTextActive]}>Admin</Text>
                    </TouchableOpacity>
                )}
            </LinearGradient>
        </SafeAreaView>
    );
}

// ==========================================
// 13. AUTH SCREEN
// ==========================================
function AuthScreen({ onLoginSuccess }) {
    const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('client'); const [loading, setLoading] = useState(false); const [isSignUp, setIsSignUp] = useState(false);
    const [lang, setLang] = useState(currentLang);
    useEffect(() => { AsyncStorage.getItem('appLang').then(savedLang => { if (savedLang) { currentLang = savedLang; setLang(savedLang); } }); }, []);
    const toggleLang = (l) => { currentLang = l; setLang(l); AsyncStorage.setItem('appLang', l); };
    function localT(key) { return TEXT[lang][key] || key; }
    async function handleAuth() { setLoading(true); if(isSignUp){const {data:{session},error}=await supabase.auth.signUp({email,password});if(session){await supabase.from('profiles').insert([{id:session.user.id,email,role}]);onLoginSuccess(session);}else Alert.alert(error.message);}else{const {data:{session},error}=await supabase.auth.signInWithPassword({email,password});if(session)onLoginSuccess(session);else Alert.alert(error.message);} setLoading(false); }
    return (
        <SafeAreaView style={styles.container}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex:1, justifyContent:'center', padding:24}}>
                    <View style={{alignItems:'center', marginBottom:40}}>
                        <Image source={{uri: LOTUS_LOGO}} style={{width:100, height:100, marginBottom:10}} />
                        <Text style={styles.title}>Specialist</Text>
                        <Text style={styles.subtitle}>{isSignUp ? (role === 'specialist' ? localT('become_specialist') : localT('find_specialist')) : localT('welcome')}</Text>
                    </View>
                    <View style={{flexDirection:'row', justifyContent:'center', marginBottom: 20}}>
                        <TouchableOpacity onPress={() => toggleLang('en')} style={[styles.filterChip, lang==='en' && styles.filterChipActive]}>
                            <Text style={[styles.filterText, lang==='en' && styles.filterTextActive]}>English</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleLang('vn')} style={[styles.filterChip, lang==='vn' && styles.filterChipActive]}>
                            <Text style={[styles.filterText, lang==='vn' && styles.filterTextActive]}>Tiếng Việt</Text>
                        </TouchableOpacity>
                    </View>
                    {isSignUp && (
                        <LinearGradient colors={['#E2E8F0', '#F7FAFC']} style={{flexDirection:'row', marginBottom:20, borderRadius:30, padding:4}}>
                            <TouchableOpacity onPress={() => setRole('client')} style={[styles.roleButton, role==='client' && styles.roleActive]}>
                                <Text style={[styles.roleText, role==='client' && styles.roleTextActive]}>{localT('client_role')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setRole('specialist')} style={[styles.roleButton, role==='specialist' && styles.roleActive]}>
                                <Text style={[styles.roleText, role==='specialist' && styles.roleTextActive]}>{localT('specialist_role')}</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    )}
                    <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{localT('email_label')}</Text>
                        <TextInput style={styles.input} placeholder={localT('email_placeholder')} value={email} onChangeText={setEmail} autoCapitalize="none"/>
                        <Text style={styles.inputLabel}>{localT('password_label')}</Text>
                        <TextInput style={styles.input} placeholder={localT('password_placeholder')} value={password} onChangeText={setPassword} secureTextEntry/>
                    </View>
                    <LinearGradient colors={['#FF6B6B', '#FFE66D']} style={styles.loginButton}>
                        <TouchableOpacity onPress={handleAuth} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.loginButtonText}>{isSignUp ? localT('signup_button') : localT('login_button')}</Text>}
                        </TouchableOpacity>
                    </LinearGradient>
                    <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.linkButton}>
                        <Text style={styles.linkText}>{isSignUp ? localT('have_account') : localT('new_user')}</Text>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
        </SafeAreaView>
    );
}

// ==========================================
// 13. MAIN APP ROUTER
// ==========================================
export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [lang, setLang] = useState('en');
  const toggleLang = (l) => { currentLang = l; setLang(l); };
  useEffect(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          if (session) fetchRole(session.user.id);
      });
      supabase.auth.onAuthStateChange((_event, session) => {
          setSession(session);
          if (session) fetchRole(session.user.id);
      });
  }, []);
  async function fetchRole(uid) {
      const timer = setTimeout(() => { if (!role) setRole('client'); }, 3000);
      const { data } = await supabase.from('profiles').select('role').eq('id', uid).single();
      clearTimeout(timer);
      setRole(data?.role || 'client');
  }
  if (!session) return <AuthScreen onLoginSuccess={setSession} />;
  if (!role) return <View style={styles.container}><ActivityIndicator size="large" color="#FF6B6B"/></View>;
  if (role === 'specialist') return <SpecialistHomeScreen session={session} lang={lang} setLang={toggleLang} />;
  return <ClientHomeScreen session={session} lang={lang} setLang={toggleLang} />;
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFE5D9', justifyContent:'center' },
  homeContainer: { flex: 1, backgroundColor: '#FFDAB9' },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  greeting: { fontSize: 16, color: '#FF477E' },
  username: { fontSize: 24, fontWeight: 'bold', color: '#2D3748' },
  pageTitle: { fontSize: 28, fontWeight:'bold', color: '#2D3748', marginVertical: 20 },
  banner: { margin: 20, borderRadius: 30, padding: 24, overflow: 'hidden', position: 'relative', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: {width: 0, height: 5}, elevation: 5 },
  bannerTextContainer: { zIndex: 1 },
  bannerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  bannerSubtitle: { fontSize: 14, color: '#FFE5D9', marginBottom: 16 },
  bannerBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 30, alignSelf: 'flex-start', shadowColor: '#FF6B6B', shadowOpacity: 0.3, shadowRadius: 5, elevation: 3 },
  bannerBtnText: { color: '#FF6B6B', fontWeight: 'bold' },
  bannerIcon: { position: 'absolute', right: -10, bottom: -10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2D3748', marginLeft: 20, marginBottom: 12, marginTop: 10 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  categoryCard: { width: '45%', height: 150, margin: 10, borderRadius: 30, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: {width: 0, height: 4}, elevation: 3 },
  iconContainer: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  categoryName: { fontSize: 16, fontWeight: 'bold', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  jobCard: { padding:20, borderRadius:30, marginBottom:16, borderWidth:0, shadowColor:'#FF477E', shadowOpacity:0.1, shadowRadius:8, elevation: 5 },
  jobHeader: { flexDirection:'row', justifyContent:'space-between', marginBottom:8 },
  jobCategory: { fontWeight:'bold', fontSize:16, color:'#2D3748' },
  jobPrice: { color:'#FF9F1C', fontWeight:'bold' },
  jobAddress: { color:'#718096', marginBottom:8 },
  jobDesc: { color:'#4A5568', marginBottom:12 },
  acceptBtn: { borderRadius:30, padding:12, alignItems:'center' },
  acceptBtnText: { color:'#fff', fontWeight:'bold' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 30 },
  statusYellow: { backgroundColor: '#FFD700' },
  statusGreen: { backgroundColor: '#FF9F1C' },
  statusBlue: { backgroundColor: '#FF477E' },
  statusText: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#FFE5D9', paddingVertical: 10, backgroundColor: '#FFE5D9', paddingBottom: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  navItem: { flex: 1, alignItems: 'center' },
  navText: { fontSize: 12, color: '#A0AEC0', marginTop: 4 },
  navTextActive: { color: '#FF6B6B', fontWeight: 'bold' },
  bookingContainer: { flex: 1, backgroundColor: '#FFDAB9' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  bookingContent: { padding: 24 },
  sectionLabel: { fontSize: 14, fontWeight: 'bold', color: '#718096', marginBottom: 10, marginTop: 10 },
  textArea: { height: 100, textAlignVertical: 'top' },
  primaryBtn: { paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 30, shadowColor: '#FF477E', shadowOpacity: 0.3, shadowRadius: 5, elevation: 3 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#2D3748', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#718096' },
  roleButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 30 },
  roleActive: { backgroundColor: '#FFE5D9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  roleText: { fontWeight: '600', color: '#718096' },
  roleTextActive: { color: '#2D3748' },
  inputContainer: { marginBottom: 24, width: '100%' },
  inputLabel: { marginLeft: 16, marginBottom: 6, color: '#718096', fontWeight: '600' },
  input: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 30, borderWidth: 1, borderColor: '#FFE5D9', fontSize: 16, marginBottom: 16, color: '#2D3748', width:'100%', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  loginButton: { paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 16, width: '100%', shadowColor: '#FF6B6B', shadowOpacity: 0.3, shadowRadius: 5, elevation: 3 },
  loginButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  linkButton: { alignItems: 'center', padding: 10 },
  linkText: { color: '#FF6B6B', fontWeight: '600' },
  chatBtnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderWidth: 1, borderColor: '#FF6B6B', borderRadius: 30, shadowColor: '#FF6B6B', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  chatBtnText: { color: '#FF6B6B', fontWeight: 'bold', marginLeft: 8 },
  chatInputContainer: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#FFE5D9', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 },
  chatInput: { flex: 1, backgroundColor: '#FFE5D9', padding: 12, borderRadius: 30, fontSize: 16 },
  avatarContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFDAB9', justifyContent: 'center', alignItems: 'center', marginBottom: 12, position: 'relative', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5, elevation: 3 },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  roleTag: { fontSize: 12, color: '#718096', marginTop: 4, backgroundColor: '#FFE5D9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 30, overflow: 'hidden' },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 30, backgroundColor: '#FFE5D9', marginRight: 10, borderWidth: 1, borderColor: '#FFDAB9', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  filterChipActive: { backgroundColor: '#FF6B6B', borderColor: '#FF6B6B' },
  filterText: { color: '#718096', fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  taskerCard: { flexDirection: 'column', borderRadius: 30, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FFDAB9', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  taskerHeader: { flexDirection: 'row', marginBottom: 12 },
  taskerAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFE5D9' },
  taskerName: { fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  taskerRate: { fontSize: 16, fontWeight: 'bold', color: '#2D3748' },
  taskerBody: { padding: 12, borderRadius: 20, marginBottom: 12 },
  taskerSkills: { fontWeight: '600', color: '#4A5568', marginBottom: 4 },
  taskerBio: { color: '#718096', fontSize: 14 },
  selectBtn: { borderRadius: 30, paddingVertical: 12, alignItems: 'center' },
  selectBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  addPortfolioBtn: { width: 80, height: 80, backgroundColor: '#FFE5D9', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 1, borderColor: '#CBD5E0', borderStyle: 'dashed', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  portfolioThumb: { width: 80, height: 80, borderRadius: 20, marginRight: 10 },
  mapMarker: { alignItems: 'center' },
  mapAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  mapBadge: { position: 'absolute', bottom: -5, paddingHorizontal: 4, borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 },
  mapScore: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginLeft: 2 },
  mapOverlay: { position: 'absolute', bottom: 20, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 30, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 30, marginTop: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 4 },
  miniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20, marginLeft: 8 },
  miniBadgeText: { fontSize: 10, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', borderRadius: 30, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2D3748', marginBottom: 16 },
  modalFullOverlay: { flex: 1, backgroundColor: '#FFDAB9', paddingTop: 20 },
  walletCard: { borderRadius:30, padding:28, marginBottom:30, shadowColor: '#000', shadowOpacity:0.2, shadowRadius:12, elevation: 5 },
  topUpBtn: { marginTop:20, paddingVertical:12, borderRadius:30, alignItems:'center', shadowColor: '#FF6B6B', shadowOpacity:0.2, shadowRadius:5, elevation: 3 },
  transactionItem: { flexDirection:'row', alignItems:'center', marginBottom:20, borderBottomWidth:1, borderBottomColor:'#FFE5D9', paddingBottom:16, borderRadius:20, shadowColor: '#000', shadowOpacity:0.05, shadowRadius:4, elevation: 2 },
  iconCircle: { width:40, height:40, borderRadius:20, justifyContent:'center', alignItems:'center' },
  verifyBtn: { flexDirection: 'row', padding: 12, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#FF9F1C', shadowOpacity:0.3, shadowRadius:5, elevation: 3 },
  verifyBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  idCardUpload: { width: '100%', height: 150, backgroundColor: '#FFE5D9', borderRadius: 30, borderWidth: 2, borderColor: '#FFDAB9', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  idCardImg: { width: '100%', height: '100%', borderRadius: 30, resizeMode: 'cover' },
  adminCard: { padding:16, borderRadius:30, marginBottom:16, borderWidth:1, borderColor:'#FFE5D9', shadowColor:'#000', shadowOpacity:0.1, shadowRadius:8, shadowOffset:{width:0, height:2}, elevation: 3 },
  adminThumb: { width: 80, height: 60, borderRadius: 20, marginRight: 10, justifyContent:'center', alignItems:'center' },
  amountBox: { paddingHorizontal:24, paddingVertical:16, borderRadius:30, borderWidth:1, borderColor:'#FFE5D9', backgroundColor:'#FFE5D9', margin:8, alignItems:'center', minWidth:150, shadowColor: '#000', shadowOpacity:0.05, shadowRadius:4, elevation: 2 },
  amountBoxActive: { borderColor:'#FF6B6B', shadowColor: '#FFE66D', shadowOpacity:0.2, shadowRadius:5, elevation: 4 },
  amountText: { fontWeight:'bold', color:'#2D3748' },
  methodRow: { flexDirection:'row', alignItems:'center', padding:18, borderRadius:30, borderWidth:1, borderColor:'#FFE5D9', backgroundColor:'#FFE5D9', marginBottom:12, shadowColor: '#000', shadowOpacity:0.05, shadowRadius:4, elevation: 2 },
  methodRowActive: { borderColor:'#FFE66D', backgroundColor:'#FFE5D9' }
});