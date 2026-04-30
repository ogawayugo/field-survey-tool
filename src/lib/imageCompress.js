import { PHOTO_MAX_DIM, PHOTO_QUALITY } from '../config/constants';

export const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > PHOTO_MAX_DIM || height > PHOTO_MAX_DIM) {
        if (width > height) { height = (height * PHOTO_MAX_DIM) / width; width = PHOTO_MAX_DIM; }
        else { width = (width * PHOTO_MAX_DIM) / height; height = PHOTO_MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    img.onerror = reject;
    img.src = e.target.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
