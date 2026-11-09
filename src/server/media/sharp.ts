import sharp from "sharp";

// The only place sharp is imported. One worker thread and no cache keep memory low on a small instance
// (the 512 MB Render free tier). Set once, here, before any image is processed.
sharp.concurrency(1);
sharp.cache(false);

export default sharp;
