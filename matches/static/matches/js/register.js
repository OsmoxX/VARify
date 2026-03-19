// Password strength meter
window.checkStrength = function(pw) {
    const fill = document.getElementById('strength-fill');
    const label = document.getElementById('strength-label');
    if (!fill || !label) return;
    let score = 0;
    if (pw.length >= 8)          score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
        { pct: '0%',   color: 'transparent', text: 'Password strength' },
        { pct: '25%',  color: '#ef4444',      text: '⚠ Weak' },
        { pct: '50%',  color: '#f59e0b',      text: '● Fair' },
        { pct: '75%',  color: '#3b82f6',      text: '✓ Good' },
        { pct: '100%', color: '#10b981',       text: '✓✓ Strong' },
    ];
    const l = levels[score] || levels[0];
    fill.style.width      = l.pct;
    fill.style.background = l.color;
    label.textContent     = l.text;
    label.style.color     = l.color === 'transparent' ? '#6b7280' : l.color;
};

// 1. Show/hide password toggle
window.togglePass = function(inputId, btn) {
    const inp  = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (!inp || !icon) return;
    if (inp.type === 'password') {
        inp.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        inp.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // 2. Bouncing football animation
    const ball = document.getElementById('football');
    if (ball) {
        let x  = Math.random() * (window.innerWidth - 60);
        let y  = Math.random() * (window.innerHeight - 60);
        let vx = 2.5 + Math.random() * 1.5;
        let vy = 2.0 + Math.random() * 1.5;
        let angle = 0;

        function animateBall() {
            x += vx;
            y += vy;
            angle += 3;
            if (x + 50 >= window.innerWidth  || x <= 0) vx *= -1; 
            if (y + 50 >= window.innerHeight || y <= 0) vy *= -1; 
            ball.style.left      = Math.max(0, Math.min(x, window.innerWidth  - 50)) + 'px';
            ball.style.top       = Math.max(0, Math.min(y, window.innerHeight - 50)) + 'px';
            ball.style.transform = `rotate(${angle}deg)`;
            requestAnimationFrame(animateBall);
        }
        animateBall();
    }

    // 3. Generate floating particles
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles';
    document.body.appendChild(particlesContainer);
    for(let i=0; i<30; i++) {
        let p = document.createElement('div');
        p.className = 'particle';
        p.style.setProperty('--left', Math.random() * 100 + '%');
        p.style.setProperty('--duration', (7 + Math.random() * 8) + 's');
        p.style.animationDelay = (Math.random() * 8) + 's';
        particlesContainer.appendChild(p);
    }

    // 4. Parallax 3D tilt effect on card
    const card = document.querySelector('.card');
    if (card) {
        document.addEventListener('mousemove', (e) => {
            const xAxis = (window.innerWidth / 2 - e.pageX) / 35;
            const yAxis = (window.innerHeight / 2 - e.pageY) / 35;
            card.style.transform = `perspective(1000px) rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
        });
        document.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateY(0deg) rotateX(0deg)`;
            card.style.transition = 'transform 0.5s ease';
        });
        document.addEventListener('mouseenter', () => {
             card.style.transition = 'none';
        });
    }
});
