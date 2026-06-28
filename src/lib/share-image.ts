import type { Dye } from './types';

const W = 1200;
const H = 630;
const SHARE_COUNT = 4;

// ponytail: Canvas で client-side 生成。adapter-static で server runtime がないため。
// Satori / Workers ルートは要らない、Web Share API + ダウンロードで完結する。
export async function renderShareImage(dyes: Dye[], personaText?: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unsupported');

  const top = dyes.slice(0, SHARE_COUNT);

  ctx.fillStyle = '#F5F1EB';
  ctx.fillRect(0, 0, W, H);

  // 装飾ドット（spec の左上 / 右下）
  ctx.globalAlpha = 0.4;
  dot(ctx, 110, 90, 40, '#E1BED1');
  dot(ctx, 170, 140, 28, '#BDE5E9');
  dot(ctx, 1090, 540, 46, '#F0DCB4');
  dot(ctx, 1040, 590, 32, '#DCC8E1');
  ctx.globalAlpha = 1;

  const jpFont =
    '"M PLUS Rounded 1c", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif';
  // Canvas は font 読み込み完了前だと fallback で焼かれる → 明示的に待つ
  await Promise.all([
    document.fonts.load(`bold 64px "M PLUS Rounded 1c"`),
    document.fonts.load(`bold 48px "M PLUS Rounded 1c"`),
    document.fonts.load(`400 32px "M PLUS Rounded 1c"`),
    document.fonts.load(`600 28px "M PLUS Rounded 1c"`),
  ]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // persona バッジ（主役）
  if (personaText) {
    ctx.fillStyle = '#F56496';
    ctx.font = `bold 64px ${jpFont}`;
    ctx.fillText(personaText, W / 2, 130);
  }

  // 4 色を水平に並べる（6 色のヘキサゴンは「うるさい」ので 4 色一列に）
  const r = 84;
  const cy = personaText ? 310 : 230;
  const gap = 220;
  const startX = W / 2 - (gap * (SHARE_COUNT - 1)) / 2;
  for (let i = 0; i < top.length; i++) {
    const cx = startX + gap * i;
    ctx.shadowColor = 'rgba(20, 20, 50, 0.12)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    dot(ctx, cx, cy, r, top[i].hex);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const titleY = personaText ? 470 : 430;
  ctx.fillStyle = '#141432';
  ctx.font = `bold 48px ${jpFont}`;
  ctx.fillText('あなたへのおすすめ 4 色', W / 2, titleY);

  ctx.fillStyle = '#555577';
  ctx.font = `400 32px ${jpFont}`;
  ctx.fillText('推しカララント、見つけよう。', W / 2, titleY + 55);

  ctx.fillStyle = '#F56496';
  ctx.font = `600 28px ${jpFont}`;
  ctx.fillText('カララントスワイプ', W / 2, titleY + 110);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export async function shareResult(
  dyes: Dye[],
  url: string,
  text: string,
  personaText?: string
): Promise<void> {
  const blob = await renderShareImage(dyes, personaText);
  const file = new File([blob], 'colorant-swipe.png', { type: 'image/png' });

  // Web Share API（files 対応）: iOS Safari / Android Chrome
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (nav.canShare?.({ files: [file] })) {
    try {
      const data: ShareData = { files: [file], text };
      if (url) data.url = url;
      await nav.share(data);
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
      // 失敗時はダウンロードにフォールバック
    }
  }

  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = 'colorant-swipe.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
}
