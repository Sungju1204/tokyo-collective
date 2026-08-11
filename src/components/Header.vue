<template>
  <header class="header">
    <div class="logo-container">
      <img src="@/assets/logo.png" alt="Tokyo Collective Logo" class="logo">
    </div>
    <nav class="nav">
      <a href="#" class="nav-link">Outer</a>
      <a href="#" class="nav-link">Top</a>
      <a href="#" class="nav-link">Bottom</a>
      <a href="#" class="nav-link">Acc</a>
    </nav>
  </header>
</template>

<style scoped>
.header {
  width: 100%;
  padding: 40px 0 20px;
  text-align: center;
  background-color: #000;
  border-bottom: 1px solid #222;
  box-sizing: border-box;
}

.logo {
  width: 200px;
  height: auto;
  margin-bottom: 30px;
  /* Placeholder for actual logo */
  filter: brightness(0.9);
}

.nav {
  display: flex;
  justify-content: center;
  gap: 60px;
}

.nav-link {
  color: #ccc;
  text-decoration: none;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;
}

.nav-link:hover {
  color: #fff;
}
</style>
