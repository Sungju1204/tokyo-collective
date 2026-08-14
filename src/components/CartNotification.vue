<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const isVisible = ref(false)
const productName = ref('')

function show(name) {
  productName.value = name
  isVisible.value = true
}

function goToCart() {
  isVisible.value = false
  router.push('/cart')
}

function continueShopping() {
  isVisible.value = false
}

defineExpose({
  show
})
</script>

<template>
  <div v-if="isVisible" class="notification-overlay">
    <div class="notification-modal">
      <div class="notification-content">
        <p class="notification-message">{{ productName }}이(가) 장바구니에 담겼습니다!</p>
      </div>
      <div class="notification-actions">
        <button class="btn btn-secondary" @click="continueShopping">계속 쇼핑하기</button>
        <button class="btn btn-primary" @click="goToCart">장바구니로 이동</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.notification-modal {
  background: var(--color-ink);
  border: 1px solid var(--color-hairline);
  padding: 32px;
  max-width: 400px;
  width: 90%;
  box-sizing: border-box;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.notification-content {
  margin-bottom: 24px;
}

.notification-message {
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--color-paper);
  margin: 0;
  text-align: center;
}

.notification-actions {
  display: flex;
  gap: 12px;
}

.btn {
  flex: 1;
  padding: 12px 24px;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: var(--font-body);
}

.btn-primary {
  background: var(--color-ink);
  color: var(--color-paper);
  border: 1px solid var(--color-hairline);
}

.btn-primary:hover {
  background: var(--color-paper);
  color: var(--color-ink);
}

.btn-secondary {
  background: transparent;
  color: var(--color-paper);
  border: 1px solid var(--color-hairline);
}

.btn-secondary:hover {
  background: var(--color-hairline);
  color: var(--color-paper);
}
</style>
