/* 계약서 금액과 날짜 표기를 화면 전체에서 통일합니다. */
window.paymentUtils = (() => {
  function formatDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let parts;
    if (/^\d{8}$/.test(raw)) parts = [raw.slice(0,4), raw.slice(4,6), raw.slice(6,8)];
    else {
      const match = raw.match(/^(\d{4})\s*(?:년|[.\/-])\s*(\d{1,2})\s*(?:월|[.\/-])\s*(\d{1,2})\s*(?:일|\.)?$/);
      if (!match) return null;
      parts = match.slice(1);
    }
    const [year, month, day] = parts.map(Number), date = new Date(year, month - 1, day);
    if (year < 1900 || year > 2099 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return `${String(year).padStart(4,'0')}.${String(month).padStart(2,'0')}.${String(day).padStart(2,'0')}.`;
  }
  function maskDate(value) {
    const digits = String(value).replace(/\D/g, '').slice(0, 8);
    return digits.slice(0,4) + (digits.length > 4 ? '.' + digits.slice(4,6) : '') + (digits.length > 6 ? '.' + digits.slice(6,8) : '') + (digits.length === 8 ? '.' : '');
  }
  const isTotal = label => /^(?:총\s*)?매매\s*(?:대금|금액)$/.test(String(label || '').trim());
  function hasAmount(value) {
    const text = String(value || '').trim();
    return /\[판독 불가\]/.test(text) || /\d/.test(text) || /[십백천만억조]/.test(text);
  }
  return {formatDate, maskDate, isTotal, hasAmount};
})();
