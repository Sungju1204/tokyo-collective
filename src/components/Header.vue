<script setup>
import logo from '../assets/logo.svg'

const categories = ['Outer', 'Top', 'Bottom', 'Acc']

const props = defineProps({
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
  },
  activeCategory: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select-category'])

function selectCategory(category) {
  emit('select-category', props.activeCategory === category ? null : category)
}

function resetCategory() {
  emit('select-category', null)
}
</script>

<template>
  <header class="header">
    <div class="logo-container">
      <img :src="logo" alt="Tokyo Collective" class="logo" @click="resetCategory" />
    </div>
    <div class="header-bar">
      <nav class="nav">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          class="nav-link"
          :class="{ active: activeCategory === category }"
          @click="selectCategory(category)"
        >{{ category }}</button>
      </nav>
    </div>
    <div class="header-intro">
      <p v-show="!loading && !error" class="piece-count">{{ count }} pieces in rotation</p>
    </div>
  </header>
</template>

<style scoped>
.header {
  width: 100%;
  padding: 32px 0 40px;
  border-bottom: 1px solid var(--color-hairline);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo-container {
  margin-bottom: 32px;
}

.logo {
  height: 60px;
  width: auto;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.logo:hover {
  opacity: 0.8;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40px;
  width: 100%;
}

.nav {
  display: flex;
  gap: 40px;
}

.nav-link {
  font: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--color-ash);
  text-decoration: none;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;
}

.nav-link:hover,
.nav-link.active {
  color: var(--color-patina);
}

.header-intro {
  text-align: center;
  width: 100%;
}

.piece-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-ash);
  margin: 0;
}

@media (max-width: 768px) {
  .logo-container {
    margin-bottom: 24px;
  }

  .logo {
    height: 48px;
  }

  .header-bar {
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .nav {
    gap: 24px;
  }
}
</style>
