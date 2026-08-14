<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart'
import Header from '../components/Header.vue'
import Footer from '../components/Footer.vue'

const router = useRouter()
const cartStore = useCartStore()

const loading = ref(false)
const orderPlaced = ref(false)
const orderId = ref(null)

const formData = ref({
  customerName: '',
  phoneNumber: '',
  email: '',
  address: '',
  zipCode: '',
  memo: ''
})

async function submitOrder() {
  // Validation
  if (!formData.value.customerName || !formData.value.phoneNumber || !formData.value.email || !formData.value.address) {
    alert('필수 정보를 모두 입력해주세요.')
    return
  }

  loading.value = true

  try {
    const orderData = {
      customer: {
        name: formData.value.customerName,
        phone: formData.value.phoneNumber,
        email: formData.value.email,
        address: formData.value.address,
        zipCode: formData.value.zipCode,
        memo: formData.value.memo
      },
      items: cartStore.items,
      totalPrice: cartStore.totalPrice,
      status: 'pending'
    }

    const response = await fetch('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    })

    if (!response.ok) {
      throw new Error('Order creation failed')
    }

    const order = await response.json()
    orderId.value = order.id
    orderPlaced.value = true
    cartStore.clearCart()

    // Redirect to home after 3 seconds
    setTimeout(() => {
      router.push('/')
    }, 3000)
  } catch (err) {
    console.error('Order error:', err)
    alert('주문 처리 중 오류가 발생했습니다.')
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push('/cart')
}
</script>

<template>
  <div class="app-container">
    <Header :count="0" :loading="false" :error="null" />
    <main class="main-content">
      <div class="checkout-container">
        <div v-if="!orderPlaced" class="checkout-content">
          <!-- Order Summary -->
          <div class="order-summary">
            <h3 class="section-title">주문 상품</h3>
            <div class="summary-items">
              <div v-for="item in cartStore.items" :key="item.id" class="summary-item">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-qty">{{ item.quantity }}개</span>
                <span class="item-price">{{ (item.price * item.quantity).toLocaleString() }}원</span>
              </div>
            </div>
            <div class="summary-total">
              <span class="total-label">총 금액</span>
              <span class="total-amount">{{ cartStore.totalPrice.toLocaleString() }}원</span>
            </div>
          </div>

          <!-- Customer Info Form -->
          <form @submit.prevent="submitOrder" class="checkout-form">
            <h3 class="section-title">배송 정보</h3>

            <div class="form-group">
              <label for="name">이름 *</label>
              <input
                id="name"
                v-model="formData.customerName"
                type="text"
                placeholder="성명을 입력하세요"
                required
              />
            </div>

            <div class="form-group">
              <label for="phone">연락처 *</label>
              <input
                id="phone"
                v-model="formData.phoneNumber"
                type="tel"
                placeholder="010-0000-0000"
                required
              />
            </div>

            <div class="form-group">
              <label for="email">이메일 *</label>
              <input
                id="email"
                v-model="formData.email"
                type="email"
                placeholder="example@email.com"
                required
              />
            </div>

            <div class="form-group">
              <label for="address">배송주소 *</label>
              <input
                id="address"
                v-model="formData.address"
                type="text"
                placeholder="배송받을 주소를 입력하세요"
                required
              />
            </div>

            <div class="form-group">
              <label for="zipcode">우편번호</label>
              <input
                id="zipcode"
                v-model="formData.zipCode"
                type="text"
                placeholder="우편번호"
              />
            </div>

            <div class="form-group">
              <label for="memo">배송 요청사항</label>
              <textarea
                id="memo"
                v-model="formData.memo"
                placeholder="배송 시 특별한 요청사항이 있으면 입력하세요 (선택)"
                rows="3"
              ></textarea>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="goBack" :disabled="loading">
                이전으로
              </button>
              <button type="submit" class="btn btn-primary" :disabled="loading">
                {{ loading ? '주문 처리 중...' : '주문하기' }}
              </button>
            </div>
          </form>
        </div>

        <div v-else class="order-success">
          <div class="success-message">
            <h3>주문이 완료되었습니다!</h3>
            <p class="order-id">주문번호: {{ orderId }}</p>
            <p class="success-text">감사합니다. 곧 홈페이지로 이동합니다.</p>
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

.checkout-container {
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

.checkout-content {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 40px;
  align-items: start;
}

.section-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-paper);
  margin: 0 0 20px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.order-summary {
  border: 1px solid var(--color-hairline);
  padding: 24px;
  position: sticky;
  top: 20px;
}

.summary-items {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--color-hairline);
  padding-bottom: 20px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-paper);
}

.item-name {
  flex: 1;
}

.item-qty {
  color: var(--color-ash);
  margin: 0 16px;
}

.item-price {
  text-align: right;
  font-weight: 600;
}

.summary-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--color-paper);
}

.total-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.9rem;
}

.total-amount {
  text-align: right;
}

.checkout-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-paper);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-group input,
.form-group textarea {
  padding: 12px;
  border: 1px solid var(--color-hairline);
  background: transparent;
  color: var(--color-paper);
  font-family: var(--font-body);
  font-size: 0.95rem;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--color-ash);
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-patina);
  box-shadow: 0 0 0 2px rgba(139, 131, 122, 0.1);
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
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
  flex: 1;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-ink);
  color: var(--color-paper);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.8;
}

.btn-secondary {
  background: transparent;
  color: var(--color-paper);
  border: 1px solid var(--color-hairline);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-paper);
  color: var(--color-ink);
}

.order-success {
  text-align: center;
  padding: 80px 20px;
}

.success-message {
  max-width: 400px;
  margin: 0 auto;
}

.success-message h3 {
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--color-paper);
  margin: 0 0 16px;
}

.order-id {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--color-ash);
  margin: 0 0 12px;
}

.success-text {
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--color-paper);
  margin: 0;
}

@media (max-width: 768px) {
  .checkout-content {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .order-summary {
    position: static;
  }

  .page-title {
    font-size: 1.5rem;
  }

  .form-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
