# Landing page photos

The landing page (`src/app/[locale]/page.tsx`) shows seven stock photos from Pexels, resized into `public/landing/` (the hero at 1400 px wide, the others at 720 to 960 px). No other photo is committed for the landing page.

| File | Used for | Source page |
| --- | --- | --- |
| `couple-joy.jpg` | hero, closing banner | https://www.pexels.com/photo/smiling-newlyweds-hugging-and-holding-money-19698120/ |
| `couple-pink.jpg` | guest strip, venue screen | https://www.pexels.com/photo/portrait-of-newlyweds-in-pink-traditional-clothing-12909055/ (Ihsan Adityawarman) |
| `couple-mono.jpg` | guest strip, step one | https://www.pexels.com/photo/woman-in-hijab-leaning-on-man-17057190/ |
| `couple-outdoor.jpg` | guest strip, step three | https://www.pexels.com/photo/romantic-outdoor-muslim-wedding-portrait-31619536/ |
| `bride-leaves.jpg` | guest strip, step two | https://www.pexels.com/photo/bride-in-traditional-wedding-dress-12898461/ |
| `bride-henna.jpg` | guest strip | https://www.pexels.com/photo/smiling-bride-in-crown-and-hijab-19020843/ |
| `bride-veil.jpg` | guest strip | https://www.pexels.com/photo/bride-wearing-a-white-dress-and-hijab-with-a-veil-sitting-and-smiling-13228483/ |

## Before public launch

These are photos of real, identifiable people. Pexels' licence lets us use the files, but it does not cover those people's consent to appear in advertising. The developer approved them for this stage only. Before the site is public, replace them with model-released or commissioned photos (keep the file names, or update `PHOTOS` in the landing page), and update this file.

The sample guest names and wishes on the landing page are invented and are not tied to the people in the photos.

## Adding or replacing a photo

Resize before committing (a hero of about 1400 px, cards of about 720 px wide, JPEG quality near 78), give every `img` its `width` and `height`, and put its alt text in `messages/ms.json` and `messages/en.json` under `home.photos`.