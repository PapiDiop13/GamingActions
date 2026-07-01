import { FRAMES, VIDEO_FRAMES, COMMENT_FRAMES } from './src/constants/frames.js';
import { PROFILE_BACKGROUNDS, PROFILE_BANNERS, USERNAME_EFFECTS, PROFILE_BADGES, CARD_BORDERS, PROFILE_THEMES } from './src/constants/cosmetics.js';

const groups = {
  avatar_frame: FRAMES, video_frame: VIDEO_FRAMES, comment_frame: COMMENT_FRAMES,
  background: PROFILE_BACKGROUNDS, banner: PROFILE_BANNERS, username_effect: USERNAME_EFFECTS,
  badge: PROFILE_BADGES, card_border: CARD_BORDERS, theme: PROFILE_THEMES,
};
let all = [];
for (const [cat, arr] of Object.entries(groups)) {
  for (const it of arr) {
    if (it.dollarsPrice && it.dollarsPrice > 0) {
      all.push({ cat, id: it.id, name: it.name, price: it.dollarsPrice });
    }
  }
}
// summary
const byCat = {};
const byPrice = {};
for (const i of all) { byCat[i.cat]=(byCat[i.cat]||0)+1; byPrice[i.price]=(byPrice[i.price]||0)+1; }
console.log('TOTAL paid items:', all.length);
console.log('By category:', JSON.stringify(byCat,null,0));
console.log('By price (CAD):', JSON.stringify(byPrice,null,0));
console.log('---JSON---');
console.log(JSON.stringify(all));
