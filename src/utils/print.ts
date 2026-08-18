// Black Gold - Full Page Print Helper
// Opens a new window with full document, not modal window

export function openFullPagePrint(title: string, logoUrl: string = '/logo.png') {
  const printArea = document.querySelector('.print-area') as HTMLElement;
  if (!printArea) {
    window.print();
    return;
  }

  const content = printArea.innerHTML;
  
  // Clone all styles from current document for better fidelity
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el: any) => el.outerHTML)
    .join('\n');

  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) {
    // Fallback to regular print if popup blocked
    window.print();
    return;
  }

  printWindow.document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - Black Gold Asphalt & Sealcoating</title>
${styles}
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: white !important;
    margin: 0;
    padding: 24px;
    color: #111;
  }
  .print-area {
    max-width: 800px;
    margin: 0 auto;
    background: white;
  }
  .print-header {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    border-bottom: 4px solid #000;
    padding-bottom: 16px;
    margin-bottom: 20px;
    position: relative;
  }
  .print-header::after {
    content: '';
    position: absolute;
    bottom: -10px;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #C5A032 0%, #000 100%);
  }
  img {
    max-width: 100%;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  table th {
    background: #000 !important;
    color: #C5A032 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    body { padding: 0; }
    button { display: none !important; }
    .no-print { display: none !important; }
  }
  /* Black Gold branding for print */
  .brand-gold { color: #C5A032 !important; }
  .brand-black { background: #000 !important; color: #C5A032 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
  <div class="print-area">
    ${content}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function(){
        window.focus();
        window.print();
        // window.close() after print is optional - some browsers block it
        // window.onafterprint = function(){ window.close(); }
      }, 500);
    }
  </script>
</body>
</html>
  `);
  printWindow.document.close();
}

// Alternative: Generate print HTML manually with logo ensured loaded as base64
export function openPrintWithLogo(title: string) {
  // Try to get logo as base64 from existing img to ensure it prints even offline
  const logoImg = document.querySelector('img[src="/logo.png"]') as HTMLImageElement;
  let logoSrc = '/logo.png';
  
  // If we can get the actual image data, use it
  try {
    if (logoImg && logoImg.complete) {
      const canvas = document.createElement('canvas');
      canvas.width = logoImg.naturalWidth;
      canvas.height = logoImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(logoImg, 0, 0);
        // Only use dataURL if it's not tainted (same origin)
        logoSrc = canvas.toDataURL('image/png');
      }
    }
  } catch {}

  const printArea = document.querySelector('.print-area') as HTMLElement;
  if (!printArea) {
    window.print();
    return;
  }

  // Clone and replace logo src to ensure it shows
  let content = printArea.innerHTML;
  // Ensure logo images in content use the working src
  if (logoSrc.startsWith('data:')) {
    content = content.replace(/src="\/logo\.png"/g, `src="${logoSrc}"`);
  }

  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 32px; background: white; color: #111; line-height: 1.5; }
  .print-header { display: flex; gap: 20px; border-bottom: 4px solid #000; padding-bottom: 16px; margin-bottom: 24px; }
  .print-header img { width: 90px; height: 90px; object-fit: contain; background: white; border-radius: 12px; border: 2px solid #C5A032; padding: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #000; color: #C5A032; padding: 10px; text-align: left; font-weight: 900; }
  td { padding: 10px; border-bottom: 1px solid #eee; }
  .totals { margin-left: auto; width: 300px; border: 2px solid #000; border-radius: 12px; padding: 16px; background: #000; color: white; }
  .totals .row { display: flex; justify-content: space-between; margin: 6px 0; }
  .totals .total { font-weight: 900; font-size: 18px; color: #C5A032; border-top: 2px solid #C5A032; padding-top: 8px; margin-top: 8px; }
  .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 2px solid #eee; font-size: 11px; color: #666; }
  button { display: none !important; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  ${content}
  <div class="footer">
    <p>Thank you for choosing Black Gold Asphalt & Sealcoating!</p>
    <p>(380) 201-5143 • justusasphalt@gmail.com • Columbus, Ohio and surrounding areas • OH Lic #BG-2024</p>
  </div>
  <script>
    window.onload = function() {
      setTimeout(() => {
        window.print();
      }, 600);
    }
  </script>
</body>
</html>
  `);
  printWindow.document.close();
}
