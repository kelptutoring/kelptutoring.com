export function normalizeExpression(expression) {
  if (!expression) return '';
  return expression
    .replace(/\s+/g, '')
    .replace(/\^/g, '**')
    .replace(/(?<![A-Za-z])pi(?![A-Za-z])/gi, 'Math.PI')
    .replace(/(?<![A-Za-z])e(?![A-Za-z])/g, 'Math.E')
    .replace(/sin\(/gi, 'Math.sin(')
    .replace(/cos\(/gi, 'Math.cos(')
    .replace(/tan\(/gi, 'Math.tan(')
    .replace(/sqrt\(/gi, 'Math.sqrt(')
    .replace(/abs\(/gi, 'Math.abs(')
    .replace(/log\(/gi, 'Math.log(')
    .replace(/exp\(/gi, 'Math.exp(');
}

export function evaluateExpression(expression, x) {
  const safe = normalizeExpression(expression);
  if (!safe) return null;
  try {
    const fn = new Function('x', `return ${safe};`);
    const y = fn(x);
    return Number.isFinite(y) ? y : null;
  } catch (error) {
    return null;
  }
}

export function plotExpression(canvas, expression) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = 20;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d7e0db';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += scale) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += scale) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#8fa39a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();

  if (!expression) return;
  ctx.strokeStyle = '#00ACC1';
  ctx.lineWidth = 2.4;
  let started = false;
  for (let px = 0; px <= width; px += 1) {
    const x = (px - centerX) / scale;
    const yValue = evaluateExpression(expression, x);
    if (yValue === null) {
      started = false;
      continue;
    }
    const py = centerY - yValue * scale;
    if (!started) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
}

export async function typesetMath(container) {
  if (!container || !window.MathJax?.typesetPromise) return;
  await window.MathJax.typesetPromise([container]);
}

export function createCountdown(targetEl, minutes) {
  if (!targetEl || !minutes) return () => {};
  let remaining = minutes * 60;
  const timer = setInterval(() => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    targetEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    if (remaining <= 0) clearInterval(timer);
    remaining -= 1;
  }, 1000);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  targetEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  return () => clearInterval(timer);
}
