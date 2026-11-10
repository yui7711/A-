document.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(location.search).get('tool') === '1') {
    document.getElementById('btnTools').click();
  }
});
