import toast from 'react-hot-toast';

const toastStyle = {
  className: 'lingo-toast',
  duration: 2000,
  position: 'top-right',
};

const errorToastStyle = {
  ...toastStyle,
  className: 'lingo-toast lingo-toast--error',
  duration: 3000,
};

export const showSuccess = (message) => {
  toast.success(message, { ...toastStyle, className: 'lingo-toast lingo-toast--success' });
};

export const showInfo = (message) => {
  toast(message, { ...toastStyle, className: 'lingo-toast lingo-toast--info' });
};

export const showError = (message) => {
  toast.error(message, errorToastStyle);
};
