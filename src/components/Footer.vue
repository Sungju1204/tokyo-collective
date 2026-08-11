<template>
  <footer class="footer">
    <div class="social-links">
      <a href="#" class="footer-link">Instagram</a>
      <a href="#" class="footer-link">Fruits Family</a>
      <a href="#" class="footer-link">Bunjang</a>
    </div>
    <p class="copyright">&copy; TOKYO COLLECTIVE ALL RIGHTS RESERVED.</p>
  </footer>
</template>

<style scoped>
.footer {
  width: 100%;
  padding: 60px 0 40px;
  background-color: #000;
  text-align: center;
  box-sizing: border-box;
}

.social-links {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 20px;
}

.footer-link {
  color: #888;
  text-decoration: none;
  font-size: 0.7rem;
  font-weight: 400;
  letter-spacing: 0.02em;
}

.footer-link:hover {
  color: #ccc;
}

.copyright {
  color: #444;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}
</style>
