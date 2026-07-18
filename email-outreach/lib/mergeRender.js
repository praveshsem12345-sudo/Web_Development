// lib/mergeRender.js
export function renderTemplate(template, data) {
  const lowerData = {};
  for (const key of Object.keys(data)) {
    lowerData[key.toLowerCase()] = data[key];
  }

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const lookupKey = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(lowerData, lookupKey) ? lowerData[lookupKey] : match;
  });
}
