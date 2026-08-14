<script setup>
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart'
import Header from '../components/Header.vue'
import Footer from '../components/Footer.vue'

const router = useRouter()
const cartStore = useCartStore()

function goToCheckout() {
  if (cartStore.items.length > 0) {
    router.push('/checkout')
  }
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="app-container">
    <Header :count="0" :loading="false" :error="null" />
    <main class="main-content">
      <div class="cart-container">
        <div v-if="cartStore.items.length === 0" class="empty-cart">
          <p class="empty-message">장바구니가 비어있습니다.</p>
          <button class="btn btn-primary" @click="goHome">계속 쇼핑하기</button>
        </div>

        <div v-else class="cart-content">
          <table class="cart-table">
            <thead>
              <tr>
                <th class="col-name">상품명</th>
                <th class="col-price">가격</th>
                <th class="col-quantity">수량</th>
                <th class="col-total">합계</th>
                <th class="col-action"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in cartStore.items" :key="item.id" class="cart-row">
                <td class="col-name">{{ item.name }}</td>
                <td class="col-price">{{ item.price.toLocaleString() }}원</td>
                <td class="col-quantity">
                  <div class="quantity-control">
                    <button @click="cartStore.updateQuantity(item.id, item.quantity - 1)">−</button>
                    <input
                      v-model.number="item.quantity"
                      type="number"
                      min="1"
                      @change="cartStore.updateQuantity(item.id, item.quantity)"
                    />
                    <button @click="cartStore.updateQuantity(item.id, item.quantity + 1)">+</button>
                  </div>
                </td>
                <td class="col-total">{{ (item.price * item.quantity).toLocaleString() }}원</td>
                <td class="col-action">
                  <button class="btn-remove" @click="cartStore.removeFromCart(item.id)">제거</button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="cart-summary">
            <div class="summary-row">
              <span class="summary-label">총 상품 개수:</span>
              <span class="summary-value">{{ cartStore.totalItems }}</span>
            </div>
            <div class="summary-row total">
              <span class="summary-label">총 금액:</span>
              <span class="summary-value">{{ cartStore.totalPrice.toLocaleString() }}원</span>
            </div>
          </div>

          <div class="cart-actions">
            <button class="btn btn-secondary" @click="goHome">계속 쇼핑하기</button>
            <button class="btn btn-primary" @click="goToCheckout">결제하기</button>
          </div>
        </div>
      </div>
    </main>
    <Footer />
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  padding: 0 40px;
  box-sizing: border-box;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding: 40px 0;
}

.cart-container {
  width: 100%;
}

.page-title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 600;
  color: var(--color-paper);
  margin: 0 0 40px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.empty-cart {
  text-align: center;
  padding: 80px 20px;
}

.empty-message {
  font-family: var(--font-body);
  font-size: 1.1rem;
  color: var(--color-ash);
  margin-bottom: 24px;
}

.cart-content {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.cart-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: 0.9rem;
}

.cart-table thead {
  border-bottom: 1px solid var(--color-hairline);
}

.cart-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: var(--color-paper);
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.cart-row {
  border-bottom: 1px solid var(--color-hairline);
}

.cart-row td {
  padding: 16px 12px;
  color: var(--color-paper);
}

.col-name {
  flex: 1;
  width: 30%;
}

.col-price {
  width: 15%;
  text-align: right;
}

.col-quantity {
  width: 15%;
}

.col-total {
  width: 15%;
  text-align: right;
}

.col-action {
  width: 10%;
  text-align: center;
}

.quantity-control {
  display: flex;
  gap: 8px;
  align-items: center;
}

.quantity-control button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-hairline);
  background: var(--color-ink);
  color: var(--color-paper);
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}

.quantity-control button:hover {
  background: var(--color-paper);
  color: var(--color-ink);
}

.quantity-control input {
  width: 50px;
  text-align: center;
  border: 1px solid var(--color-hairline);
  padding: 4px;
  font-family: var(--font-body);
  background: transparent;
  color: var(--color-paper);
}

.btn-remove {
  padding: 6px 12px;
  font-size: 0.7rem;
  background: transparent;
  color: var(--color-ash);
  border: 1px solid var(--color-hairline);
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-remove:hover {
  color: var(--color-patina);
  border-color: var(--color-patina);
}

.cart-summary {
  border: 1px solid var(--color-hairline);
  padding: 20px;
  background: rgba(32, 32, 32, 0.5);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-family: var(--font-body);
  color: var(--color-ash);
}

.summary-row.total {
  font-weight: 600;
  color: var(--color-paper);
  border-top: 1px solid var(--color-hairline);
  margin-top: 12px;
  padding-top: 12px;
  font-size: 1.1rem;
}

.summary-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.85rem;
}

.summary-value {
  text-align: right;
}

.cart-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 12px 32px;
  font-size: 0.9rem;
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
}

.btn-primary:hover {
  opacity: 0.8;
}

.btn-secondary {
  background: transparent;
  color: var(--color-paper);
  border: 1px solid var(--color-hairline);
}

.btn-secondary:hover {
  background: var(--color-paper);
  color: var(--color-ink);
}

@media (max-width: 768px) {
  .page-title {
    font-size: 1.5rem;
  }

  .cart-table {
    font-size: 0.8rem;
  }

  .cart-table th {
    font-size: 0.65rem;
    padding: 8px 4px;
  }

  .cart-row td {
    padding: 12px 4px;
  }

  .col-name {
    width: 40%;
  }

  .quantity-control {
    flex-direction: column;
    gap: 4px;
  }

  .quantity-control button {
    width: 24px;
    height: 24px;
    font-size: 0.9rem;
  }

  .quantity-control input {
    width: 40px;
  }

  .cart-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
