<template>
  <footer class="footer">
    <p class="copyright">&copy; TOKYO COLLECTIVE ALL RIGHTS RESERVED.</p>
    <div class="social-links">
      <a href="#" class="footer-link">Instagram</a>
      <a href="#" class="footer-link">Fruits Family</a>
      <a href="#" class="footer-link">Bunjang</a>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  width: 100%;
  padding: 32px 0 40px;
  border-top: 1px solid var(--color-hairline);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.copyright {
  font-family: var(--font-mono);
  color: var(--color-ash);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  margin: 0;
}

.social-links {
  display: flex;
  gap: 20px;
}

.footer-link {
  color: var(--color-ash);
  text-decoration: none;
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  transition: color 0.2s ease;
}

.footer-link:hover {
  color: var(--color-patina);
}
</style>
