"use client"
import Swal, { SweetAlertOptions, SweetAlertResult } from 'sweetalert2';

// Temel alert fonksiyonu
export const showAlert = (options: SweetAlertOptions): Promise<SweetAlertResult> => {
  // Dark mode için otomatik tema desteği
  const isDarkMode = document.documentElement.classList.contains('dark');

  return Swal.fire({
    buttonsStyling: false,
    background: isDarkMode ? 'var(--color-gray-800)' : 'var(--color-white)',
    color: isDarkMode ? 'var(--color-gray-100)' : 'var(--color-gray-900)',
    showClass: {
      popup: 'animate__animated animate__fadeIn animate__faster',
    },
    hideClass: {
      popup: 'animate__animated animate__fadeOut animate__faster',
    },
    customClass: {
      confirmButton: 'swal2-custom-confirm',
      cancelButton: options.cancelButtonText ? 'swal2-custom-cancel' : 'hidden',
      popup: 'swal2-custom-popup',
      validationMessage: 'whitespace-pre-wrap',
    },
    ...options,
  });
};

// Başarı alert'i
export const showSuccessAlert = (
  title: string,
  text?: string,
  options?: SweetAlertOptions
): Promise<SweetAlertResult> => {
  return showAlert({
    icon: 'success',
    title,
    text,
    ...options,
  });
};

// Hata alert'i
export const showErrorAlert = (
  title: string,
  text?: string,
  options?: SweetAlertOptions
): Promise<SweetAlertResult> => {
  return showAlert({
    icon: 'error',
    title,
    text,
    ...options,
  });
};

// Uyarı alert'i
export const showWarningAlert = (
  title: string,
  text?: string,
  options?: SweetAlertOptions
): Promise<SweetAlertResult> => {
  return showAlert({
    icon: 'warning',
    title,
    text,
    ...options,
  });
};

// Bilgi alert'i
export const showInfoAlert = (
  title: string,
  text?: string,
  options?: SweetAlertOptions
): Promise<SweetAlertResult> => {
  return showAlert({
    icon: 'info',
    title,
    text,
    ...options,
  });
};

// Onay alert'i
export const showConfirmAlert = (
  title: string,
  text?: string,
  confirmButtonText: string = 'Evet',
  cancelButtonText: string = 'Hayır',
  options?: SweetAlertOptions
): Promise<SweetAlertResult> => {
  return showAlert({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    ...options,
  });
};
// Select alert'i - dropdown seçenekleriyle
export const showSelectAlert = (
  title: string,
  text?: string,
  selectOptions: string[] = [],
  defaultValue?: string,
  confirmButtonText: string = 'Select',
  cancelButtonText?: string,
  options?: SweetAlertOptions
): Promise<SweetAlertResult> => {
  return showAlert({
    icon: 'question',
    title,
    text,
    input: 'select',
    inputOptions: selectOptions.reduce((acc, option, index) => {
      acc[option] = option;
      return acc;
    }, {} as Record<string, string>),
    inputPlaceholder: 'Select Parent',
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    allowOutsideClick: false,
    allowEscapeKey: false,
    ...options,
  });
};

// Input alert'i
export const showInputAlert = (
  title: string,
  inputPlaceholder?: string,
  options?: SweetAlertOptions
): Promise<SweetAlertResult> => {
  return showAlert({
    input: 'text',
    title,
    inputPlaceholder,
    showCancelButton: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    ...options,
  });
};

// Toast mesajı
export const showToast = (
  title: string,
  icon: 'success' | 'error' | 'warning' | 'info' | 'question' = 'success',
  position: 'top' | 'top-start' | 'top-end' | 'center' | 'center-start' | 'center-end' | 'bottom' | 'bottom-start' | 'bottom-end' = 'top-end',
  timer: number = 3000
): Promise<SweetAlertResult> => {
  return showAlert({
    toast: true,
    position,
    icon,
    title,
    showConfirmButton: false,
    timer,
    timerProgressBar: true,
    backdrop: false,     // Arka planı blur yapma
    width: 'auto',       // İçeriğe göre genişlik
    customClass: {
      container: 'swal2-toast-container',
      popup: 'swal2-toast-popup',
    },
  });
};

// SweetAlert CSS özelleştirmeleri için bir stil dosyası
export const SweetAlertStyles = () => {
  return (
    <style jsx global>{`
      /* Toast özellikleri */
      .toast-container {
        z-index: 9999;
      }
      
      .toast-popup {
        max-width: 300px !important;
        padding: 0.75rem 1rem !important;
        margin-top: 1rem !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      }
      
      .swal2-toast {
        padding: 0.5rem 1rem !important;
        width: auto !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      }
      
      .swal2-popup {
        border-radius: 0.5rem;
        font-family: inherit;
      }
      
      .dark .swal2-popup {
        background-color: var(--color-gray-800);
        color: var(--color-gray-100);
      }
      
      .dark .swal2-title,
      .dark .swal2-content,
      .dark .swal2-html-container {
        color: var(--color-gray-100);
      }
      
      .dark .swal2-input {
        background-color: var(--color-gray-700);
        color: var(--color-gray-100);
        border-color: var(--color-gray-600);
      }
      
      .swal2-confirm {
        background-color: var(--color-brand-600) !important;
        border-color: var(--color-brand-600) !important;
      }
      
      .dark .swal2-confirm {
        background-color: var(--color-brand-500) !important;
        border-color: var(--color-brand-500) !important;
      }
      
      .swal2-cancel {
        background-color: transparent !important;
        border-color: var(--color-gray-200) !important;
      }
      
      .dark .swal2-cancel {
        background-color: transparent !important;
        border-color: var(--color-gray-700) !important;
      }
      
      .swal2-confirm:focus,
      .swal2-cancel:focus {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
      }
      
      .dark .swal2-confirm:focus,
      .dark .swal2-cancel:focus {
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.5);
      }
      
      /* Toast için özel stil ayarları */
      .swal2-container.swal2-top-end.swal2-backdrop-show {
        background: transparent !important;
      }
    `}</style>
  );
};

export default {
  showAlert,
  showSuccessAlert,
  showErrorAlert,
  showWarningAlert,
  showInfoAlert,
  showConfirmAlert,
  showInputAlert,
  showToast,
  SweetAlertStyles,
};
