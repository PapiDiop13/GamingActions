/**
 * useAlertStore.js — Global custom alert system for Gaming Actions
 *
 * Drop-in replacement for Alert.alert() with GA branding.
 * Usage anywhere in the app:
 *
 *   import { showAlert } from '../store/useAlertStore';
 *
 *   showAlert({
 *     title: '🗑️ Delete Clip',
 *     message: 'You will lose 25 GA Points.',
 *     type: 'danger',           // 'danger' | 'warning' | 'success' | 'info' (default)
 *     buttons: [
 *       { text: 'Cancel', style: 'cancel' },
 *       { text: 'Delete', style: 'destructive', onPress: () => doDelete() },
 *     ],
 *   });
 *
 * Button styles:
 *   'default'     → gold text
 *   'cancel'      → gray text
 *   'destructive' → red text
 */

import { create } from 'zustand';

const useAlertStore = create((set) => ({
  visible: false,
  title: '',
  message: '',
  type: 'info',   // 'info' | 'success' | 'danger' | 'warning'
  buttons: [],

  show: ({ title = '', message = '', type = 'info', buttons = [] }) => {
    // Default single button if none provided
    const btns = buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }];
    set({ visible: true, title, message, type, buttons: btns });
  },

  hide: () => set({ visible: false }),
}));

// Convenience function — same API as Alert.alert(title, message, buttons)
// Can also accept an options object: showAlert({ title, message, type, buttons })
export function showAlert(titleOrOptions, message, buttons) {
  const store = useAlertStore.getState();
  if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
    store.show(titleOrOptions);
  } else {
    store.show({
      title: titleOrOptions || '',
      message: message || '',
      type: 'info',
      buttons: buttons || [],
    });
  }
}

export default useAlertStore;
