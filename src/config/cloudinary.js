export const CLOUDINARY_CONFIG = {
  cloudName: 'doeqzltv0',
  uploadPreset: 'gaming_actions_upload',
  apiKey: '865783929327982',
};

export const CLOUDINARY_FOLDERS = {
  clips: 'gaming-actions/clips',
  flashtutos: 'gaming-actions/flashtutos',
  flashinfos: 'gaming-actions/flashinfos',
  exclusives: 'gaming-actions/exclusives',
  avatars: 'gaming-actions/avatars',
};

export const optimizeVideoUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('/upload/q_auto')) return url;
  // q_auto only — automatic quality without forcing a format re-transform.
  // We avoid f_auto to not generate extra Cloudinary transformations (quota-saving).
  return url.replace('/upload/', '/upload/q_auto/');
};

export const uploadToCloudinary = async (fileUri, folder = 'gaming-actions/clips', onProgress, isLegendary = false) => {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: 'video/mp4', name: `video_${Date.now()}.mp4` });
  formData.append('upload_preset', isLegendary ? 'gaming_actions_legendary' : 'gaming_actions_free');
  formData.append('folder', folder);
  formData.append('resource_type', 'video');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/video/upload`,
    { method: 'POST', body: formData }
  );
  const data = await response.json();
  // Si le preset spécifique échoue, fallback sur le preset générique
  if (data.error) {
    const fallback = new FormData();
    fallback.append('file', { uri: fileUri, type: 'video/mp4', name: `video_${Date.now()}.mp4` });
    fallback.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
    fallback.append('folder', folder);
    fallback.append('resource_type', 'video');
    const res2 = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/video/upload`,
      { method: 'POST', body: fallback }
    );
    const data2 = await res2.json();
    if (data2.error) throw new Error(data2.error.message);
    return {
      url: optimizeVideoUrl(data2.secure_url),
      publicId: data2.public_id,
      thumbnail: `https://res.cloudinary.com/${CLOUDINARY_CONFIG.cloudName}/video/upload/so_3,w_400,h_225,c_fill,q_auto/${data2.public_id}.jpg`,
      duration: data2.duration,
    };
  }
  return {
    url: optimizeVideoUrl(data.secure_url),
    publicId: data.public_id,
    thumbnail: `https://res.cloudinary.com/${CLOUDINARY_CONFIG.cloudName}/video/upload/so_3,w_400,h_225,c_fill,q_auto/${data.public_id}.jpg`,
    duration: data.duration,
  };
};

export const uploadAvatarToCloudinary = async (fileUri) => {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: 'image/jpeg', name: `avatar_${Date.now()}.jpg` });
  formData.append('upload_preset', 'gaming_actions_free');
  formData.append('folder', CLOUDINARY_FOLDERS.avatars);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
    { method: 'POST', body: formData }
  );
  if (!response.ok) throw new Error('Avatar upload failed');
  const data = await response.json();
  return data.secure_url;
};

export const uploadBannerToCloudinary = async (fileUri) => {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: 'image/jpeg', name: `banner_${Date.now()}.jpg` });
  formData.append('upload_preset', 'gaming_actions_free');
  formData.append('folder', 'gaming-actions/banners');
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
    { method: 'POST', body: formData }
  );
  if (!response.ok) throw new Error('Banner upload failed');
  const data = await response.json();
  return data.secure_url;
};