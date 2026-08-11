<script setup>
defineProps({
  count: {
    type: Number,
    default: 0
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  }
})
</script>

<template>
  <header class="header">
    <div class="header-bar">
      <span class="wordmark">TOKYO COLLECTIVE</span>
      <nav class="nav">
        <a href="#" class="nav-link">Outer</a>
        <a href="#" class="nav-link">Top</a>
        <a href="#" class="nav-link">Bottom</a>
        <a href="#" class="nav-link">Acc</a>
      </nav>
    </div>
    <div class="header-intro">
      <h1 class="headline">ARCHIVE — TOKYO VINTAGE, CURATED</h1>
      <p v-if="!loading && !error" class="piece-count">{{ count }} pieces in rotation</p>
    </div>
  </header>
</template>

<style scoped>
.header {
  width: 100%;
  padding: 32px 0 40px;
  border-bottom: 1px solid var(--color-hairline);
  box-sizing: border-box;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 40px;
}

.wordmark {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-paper);
}

.nav {
  display: flex;
  gap: 40px;
}

.nav-link {
  color: var(--color-ash);
  text-decoration: none;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;
}

.nav-link:hover {
  color: var(--color-patina);
}

.headline {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 500;
  font-size: 1.6rem;
  color: var(--color-paper);
  margin: 0 0 8px;
}

.piece-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-ash);
  margin: 0;
}

@media (max-width: 768px) {
  .header-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .nav {
    gap: 24px;
  }

  .headline {
    font-size: 1.2rem;
  }
}
</style>
