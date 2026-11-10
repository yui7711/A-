document.addEventListener('DOMContentLoaded', () => {
  const tool = new URLSearchParams(location.search).get('tool');
  const tools = ['thermo', 'mainline', 'diverge', 'dragon', 'locate'];
  if (tool !== '1' && !tools.includes(tool)) return;
  document.getElementById('btnTools').click();
  if (tools.includes(tool) && tool !== 'thermo') document.querySelector('.dtab[data-id="'+tool+'"]').click();
});
