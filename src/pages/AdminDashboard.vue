<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const orders = ref([])
const loading = ref(true)
const error = ref('')
const selectedTab = ref('pending')
const trackingNumbers = ref({})

const filteredOrders = computed(() => {
  return orders.value.filter(order => order.status === selectedTab.value)
})

function authHeaders() {
  const token = localStorage.getItem('admin_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function loadOrders() {
  try {
    loading.value = true
    const response = await fetch('http://localhost:3000/api/orders', {
      headers: authHeaders()
    })
    if (response.status === 401) {
      router.push('/admin/login')
      return
    }
    if (!response.ok) throw new Error('Failed to load orders')
    orders.value = await response.json()
  } catch (err) {
    error.value = '주문 목록을 불러올 수 없습니다'
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const trackingNumber = trackingNumbers.value[orderId] || ''

    const response = await fetch(`http://localhost:3000/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        status: newStatus,
        trackingNumber: trackingNumber,
        notes: '관리자가 상태를 업데이트했습니다'
      })
    })

    if (response.status === 401) {
      router.push('/admin/login')
      return
    }
    if (!response.ok) throw new Error('Failed to update order')

    // 목록 새로고침
    await loadOrders()
    trackingNumbers.value[orderId] = ''
  } catch (err) {
    alert('상태 업데이트 실패: ' + err.message)
  }
}

function logout() {
  localStorage.removeItem('admin_token')
  router.push('/admin/login')
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('ko-KR') + ' ' + date.toLocaleTimeString('ko-KR')
}

function formatPrice(price) {
  return price.toLocaleString() + '원'
}

onMounted(() => {
  loadOrders()
  // 30초마다 자동 새로고침
  setInterval(loadOrders, 30000)
})
</script>

<template>
  <div class="admin-container">
    <main class="admin-content">
      <div class="admin-header">
        <h1>📦 배송 관리 대시보드</h1>
        <button class="logout-btn" @click="logout">로그아웃</button>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <div class="tabs">
        <button
          v-for="tab in ['pending', 'confirmed', 'shipped', 'delivered']"
          :key="tab"
          class="tab"
          :class="{ active: selectedTab === tab }"
          @click="selectedTab = tab"
        >
          {{ tab === 'pending' ? '배송 대기' : tab === 'confirmed' ? '확인됨' : tab === 'shipped' ? '배송중' : '배송완료' }}
          ({{ orders.filter(o => o.status === tab).length }})
        </button>
      </div>

      <div v-if="loading" class="loading">로딩 중...</div>

      <div v-else-if="filteredOrders.length === 0" class="empty">
        <p>{{ selectedTab === 'pending' ? '대기 중인 주문이 없습니다' : '주문이 없습니다' }}</p>
      </div>

      <div v-else class="orders-grid">
        <div v-for="order in filteredOrders" :key="order.id" class="order-card">
          <div class="order-header">
            <h3>{{ order.id }}</h3>
            <span class="status" :class="order.status">{{ order.status }}</span>
          </div>

          <div class="order-info">
            <p><strong>고객:</strong> {{ order.customer_name }}</p>
            <p><strong>연락처:</strong> {{ order.customer_phone }}</p>
            <p><strong>주소:</strong> {{ order.customer_address }}</p>
            <p><strong>우편번호:</strong> {{ order.customer_zipcode }}</p>
            <p v-if="order.customer_memo"><strong>요청사항:</strong> {{ order.customer_memo }}</p>
          </div>

          <div class="order-items">
            <h4>상품</h4>
            <div v-for="(item, idx) in order.items" :key="idx" class="item">
              <span>{{ item.name }} × {{ item.quantity }}</span>
              <span>{{ formatPrice(item.price * item.quantity) }}</span>
            </div>
            <div class="item-total">
              <strong>총액:</strong>
              <strong>{{ formatPrice(order.total_price) }}</strong>
            </div>
          </div>

          <div class="order-date">
            <small>주문일시: {{ formatDate(order.created_at) }}</small>
          </div>

          <div v-if="order.tracking_number" class="tracking">
            <p><strong>추적번호:</strong> {{ order.tracking_number }}</p>
          </div>

          <div v-if="order.status === 'pending'" class="action-buttons">
            <div class="tracking-input">
              <input
                v-model="trackingNumbers[order.id]"
                type="text"
                placeholder="배송 추적번호 입력 (선택사항)"
              />
            </div>
            <button
              class="btn btn-confirm"
              @click="updateOrderStatus(order.id, 'confirmed')"
            >
              ✅ 확인
            </button>
          </div>

          <div v-else-if="order.status === 'confirmed'" class="action-buttons">
            <div class="tracking-input">
              <input
                v-model="trackingNumbers[order.id]"
                type="text"
                placeholder="배송 추적번호 입력"
              />
            </div>
            <button
              class="btn btn-ship"
              @click="updateOrderStatus(order.id, 'shipped')"
            >
              🚚 배송완료
            </button>
          </div>

          <div v-else-if="order.status === 'shipped'" class="action-buttons">
            <button
              class="btn btn-deliver"
              @click="updateOrderStatus(order.id, 'delivered')"
            >
              📦 배달완료
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.admin-content {
  flex: 1;
  padding: 40px;
  background: var(--color-ink);
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
}

.admin-header h1 {
  font-family: var(--font-display);
  font-size: 2rem;
  color: var(--color-paper);
  margin: 0;
}

.logout-btn {
  padding: 8px 16px;
  background: transparent;
  color: var(--color-ash);
  border: 1px solid var(--color-hairline);
  font-family: var(--font-body);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.logout-btn:hover {
  color: var(--color-patina);
  border-color: var(--color-patina);
}

.error-message {
  padding: 16px;
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
  border-radius: 4px;
  margin-bottom: 20px;
  font-family: var(--font-body);
}

.tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--color-hairline);
  padding-bottom: 12px;
}

.tab {
  padding: 8px 16px;
  background: transparent;
  color: var(--color-ash);
  border: none;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tab:hover,
.tab.active {
  color: var(--color-patina);
}

.loading,
.empty {
  text-align: center;
  padding: 60px 20px;
  font-family: var(--font-body);
  color: var(--color-ash);
}

.orders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 24px;
}

.order-card {
  border: 1px solid var(--color-hairline);
  padding: 20px;
  background: var(--color-surface);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-hairline);
}

.order-header h3 {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--color-paper);
  margin: 0;
}

.status {
  padding: 4px 12px;
  border-radius: 12px;
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status.pending {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.status.confirmed {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
}

.status.shipped {
  background: rgba(33, 150, 243, 0.2);
  color: #2196f3;
}

.status.delivered {
  background: rgba(139, 131, 122, 0.2);
  color: var(--color-patina);
}

.order-info {
  margin-bottom: 16px;
}

.order-info p {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-paper);
  margin: 6px 0;
}

.order-info strong {
  color: var(--color-ash);
}

.order-items {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--color-ink);
  border-radius: 4px;
}

.order-items h4 {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-paper);
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.item {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-ash);
  padding: 4px 0;
}

.item-total {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-paper);
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-hairline);
}

.order-date {
  margin-bottom: 12px;
}

.order-date small {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-ash);
}

.tracking {
  margin-bottom: 12px;
  padding: 8px;
  background: var(--color-ink);
  border-radius: 4px;
}

.tracking p {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-paper);
  margin: 0;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tracking-input {
  display: flex;
}

.tracking-input input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-hairline);
  background: var(--color-ink);
  color: var(--color-paper);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  box-sizing: border-box;
}

.btn {
  padding: 10px 16px;
  border: none;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-confirm {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
}

.btn-confirm:hover {
  background: #4caf50;
  color: white;
}

.btn-ship {
  background: rgba(33, 150, 243, 0.2);
  color: #2196f3;
}

.btn-ship:hover {
  background: #2196f3;
  color: white;
}

.btn-deliver {
  background: rgba(139, 131, 122, 0.2);
  color: var(--color-patina);
}

.btn-deliver:hover {
  background: var(--color-patina);
  color: var(--color-ink);
}

@media (max-width: 768px) {
  .admin-content {
    padding: 20px;
  }

  .orders-grid {
    grid-template-columns: 1fr;
  }

  .admin-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
}
</style>
