(() => {
  const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const tidy = value => String(value || '').replace(/^[\s:;=#|.-]+|[\s|]+$/g, '').replace(/\s{2,}/g, ' ').trim();

  function labeledValue(lines, labelPattern) {
    const nextField = /\s+(?=(?:MODEL(?:\s*(?:NO\.?|NUMBER|TYPE))?|MACHINE\s*MODEL|MACHINE\s*TYPE|TYPE|SERIAL(?:\s*(?:NO\.?|NUMBER|#))?|S\s*\/?\s*N(?:\s*(?:NO\.?|NUMBER))?|S\.?N\.?|MANUFACTURER|MFR\.?|BRAND|OEM|VOLTAGE|POWER)(?:\s*[:#=]|\s+))/i;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(new RegExp(`(?:^|\\s)(?:${labelPattern})\\s*(?:[:#=–—-]\\s*)?(.*)$`, 'i'));
      if (!match) continue;
      const value = tidy(match[1].split(nextField)[0]);
      if (value) return value;
      const next = tidy(lines[i + 1]);
      if (next && !/^(?:MODEL|TYPE|SERIAL|S\s*\/?\s*N|MANUFACTURER|BRAND|VOLTAGE|POWER)\b/i.test(next)) return next;
    }
    return '';
  }

  function modelCodes(model) {
    return String(model || '').split(/\s*(?:\/|\||,|;|\bor\b)\s*/i).map(tidy).filter(Boolean);
  }

  function containsCode(text, code) {
    if (!text || !code) return false;
    const compactText = normalize(text);
    const compactCode = normalize(code);
    if (compactCode.length >= 2 && compactText === compactCode) return true;
    const flexible = String(code).trim().split('').map(ch => /[A-Z0-9]/i.test(ch) ? ch : '[\\s./_-]*').join('');
    return new RegExp(`(?:^|[^A-Z0-9])${flexible}(?=$|[^A-Z0-9])`, 'i').test(String(text));
  }

  function findCatalogMatch(text, explicitModel, catalog) {
    const haystack = `${explicitModel || ''}\n${text || ''}`;
    const entries = Array.isArray(catalog) ? catalog : [];
    for (const entry of entries) {
      for (const code of modelCodes(entry.model)) {
        if (containsCode(haystack, code)) return { entry, code };
      }
    }
    return null;
  }

  function parsePlate(text, catalog) {
    const lines = String(text || '').replace(/\r/g, '\n').split('\n').map(tidy).filter(Boolean);
    const joined = lines.join('\n');
    const model = labeledValue(lines, 'MODEL(?:\\s*(?:NO\\.?|NUMBER|TYPE))?|MACHINE\\s*MODEL|MACHINE\\s*TYPE|TYPE');
    const serial = labeledValue(lines, 'SERIAL(?:\\s*(?:NO\\.?|NUMBER|#))?|S\\s*\\/?\\s*N(?:\\s*(?:NO\\.?|NUMBER))?|S\\.?N\\.?');
    const manufacturer = labeledValue(lines, 'MANUFACTURER|MFR\\.?|BRAND|OEM');
    const match = findCatalogMatch(joined, model, catalog);
    return {
      manufacturer,
      model,
      serial,
      match: match?.entry || null,
      matchedCode: match?.code || '',
      matchConfidence: match ? 'high' : 'none'
    };
  }

  window.ScanParser = { normalize, parsePlate, findCatalogMatch };
})();
