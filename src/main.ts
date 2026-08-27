import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Application root was not found.');
}

app.innerHTML = `
  <section class="scaffold" aria-labelledby="scaffold-title">
    <p class="scaffold__eyebrow">Step 2</p>
    <h1 id="scaffold-title">Cat Mine Idle</h1>
    <p>Vite and TypeScript are ready.</p>
  </section>
`;
