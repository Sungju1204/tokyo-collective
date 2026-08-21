<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const orders = ref([])
const loading = ref(true)
const error = ref('')
const selectedTab = ref('pending')
const trackingNumbers = ref({})

const view = ref('orders') // 'orders' | 'products'
const categories = ['Outer', 'Top', 'Bottom', 'Acc']

const products = ref([])
const productsLoading = ref(true)
const productsError = ref('')
const newProduct = ref({ name: '', price: '', category: 'Top', stock: 0, external_url: '', image_url: '', description: '', size: '' })
const savingProductId = ref(null)
const importUrl = ref('')
const importing = ref(false)
const importError = ref('')

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
    const response = await fetch('/api/orders', {
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

    const response = await fetch(`/api/orders/${orderId}`, {
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

async function loadProducts() {
  try {
    productsLoading.value = true
    const response = await fetch('/api/products')
    if (!response.ok) throw new Error('Failed to load products')
    products.value = await response.json()
  } catch (err) {
    productsError.value = '상품 목록을 불러올 수 없습니다'
    console.error(err)
  } finally {
    productsLoading.value = false
  }
}

async function createProduct() {
  if (!newProduct.value.name || !newProduct.value.price) {
    alert('상품명과 가격은 필수입니다')
    return
  }
  try {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(newProduct.value)
    })
    if (response.status === 401) {
      router.push('/admin/login')
      return
    }
    if (!response.ok) throw new Error('Failed to create product')
    newProduct.value = { name: '', price: '', category: 'Top', stock: 0, external_url: '', image_url: '', description: '', size: '' }
    importUrl.value = ''
    await loadProducts()
  } catch (err) {
    alert('상품 등록 실패: ' + err.message)
  }
}

async function importFromUrl() {
  if (!importUrl.value) return
  try {
    importing.value = true
    importError.value = ''
    const response = await fetch('/api/admin/import-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ url: importUrl.value })
    })
    if (response.status === 401) {
      router.push('/admin/login')
      return
    }
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Failed to import product')

    newProduct.value = {
      name: data.name,
      price: data.price,
      category: data.category,
      stock: newProduct.value.stock || 1,
      external_url: data.external_url,
      image_url: data.image_url,
      description: data.description,
      size: data.size
    }
  } catch (err) {
    importError.value = err.message
  } finally {
    importing.value = false
  }
}

async function updateProduct(product) {
  try {
    savingProductId.value = product.id
    const response = await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        name: product.name,
        price: Number(product.price),
        category: product.category,
        stock: Number(product.stock),
        external_url: product.external_url,
        image_url: product.image_url,
        description: product.description,
        size: product.size
      })
    })
    if (response.status === 401) {
      router.push('/admin/login')
      return
    }
    if (!response.ok) throw new Error('Failed to update product')
    await loadProducts()
  } catch (err) {
    alert('상품 수정 실패: ' + err.message)
  } finally {
    savingProductId.value = null
  }
}

async function deleteProduct(id) {
  if (!confirm('이 상품을 삭제할까요?')) return
  try {
    const response = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    if (response.status === 401) {
      router.push('/admin/login')
      return
    }
    if (!response.ok) throw new Error('Failed to delete product')
    await loadProducts()
  } catch (err) {
    alert('상품 삭제 실패: ' + err.message)
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
  loadProducts()
  // 30초마다 자동 새로고침
  setInterval(loadOrders, 30000)
})
</script>

<template>
  <div class="admin-container">
    <main class="admin-content">
      <div class="admin-header">
        <h1>{{ view === 'orders' ? '📦 배송 관리 대시보드' : '🏷️ 상품 관리' }}</h1>
        <button class="logout-btn" @click="logout">로그아웃</button>
      </div>

      <div class="view-switch">
        <button
          class="view-switch-btn"
          :class="{ active: view === 'orders' }"
          @click="view = 'orders'"
        >주문 관리</button>
        <button
          class="view-switch-btn"
          :class="{ active: view === 'products' }"
          @click="view = 'products'"
        >상품 관리</button>
      </div>

      <template v-if="view === 'orders'">
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
      </template>

      <template v-else>
      <div v-if="productsError" class="error-message">{{ productsError }}</div>

      <div class="product-form">
        <h3>후르츠 링크로 가져오기</h3>
        <div class="import-row">
          <input
            v-model="importUrl"
            type="text"
            placeholder="https://fruitsfamily.com/product/..."
            class="url-input"
            @keyup.enter="importFromUrl"
          />
          <button class="btn btn-confirm" :disabled="importing" @click="importFromUrl">
            {{ importing ? '가져오는 중...' : '🔗 가져오기' }}
          </button>
        </div>
        <p v-if="importError" class="error-message">{{ importError }}</p>

        <h3>새 상품 등록</h3>
        <div class="product-form-grid">
          <input v-model="newProduct.name" type="text" placeholder="상품명" />
          <input v-model.number="newProduct.price" type="number" placeholder="가격" />
          <select v-model="newProduct.category">
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
          <input v-model.number="newProduct.stock" type="number" placeholder="재고" />
          <input v-model="newProduct.size" type="text" placeholder="사이즈" />
          <input v-model="newProduct.external_url" type="text" placeholder="후르츠 링크 (https://...)" class="url-input" />
          <input v-model="newProduct.image_url" type="text" placeholder="이미지 URL" class="url-input" />
          <textarea v-model="newProduct.description" placeholder="상품 설명" class="description-input"></textarea>
        </div>
        <div v-if="newProduct.image_url" class="preview">
          <img :src="newProduct.image_url" alt="preview" />
        </div>
        <button class="btn btn-confirm" @click="createProduct">➕ 등록</button>
      </div>

      <div v-if="productsLoading" class="loading">로딩 중...</div>

      <div v-else-if="products.length === 0" class="empty">
        <p>등록된 상품이 없습니다</p>
      </div>

      <div v-else class="products-grid">
        <div v-for="product in products" :key="product.id" class="product-card">
          <img v-if="product.image_url" :src="product.image_url" alt="" class="product-card-image" />
          <input v-model="product.name" type="text" placeholder="상품명" />
          <input v-model.number="product.price" type="number" placeholder="가격" />
          <select v-model="product.category">
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
          <input v-model.number="product.stock" type="number" placeholder="재고" />
          <input v-model="product.size" type="text" placeholder="사이즈" />
          <input v-model="product.external_url" type="text" placeholder="후르츠 링크" class="url-input" />
          <input v-model="product.image_url" type="text" placeholder="이미지 URL" class="url-input" />
          <textarea v-model="product.description" placeholder="상품 설명" class="description-input"></textarea>
          <div class="product-card-actions">
            <button
              class="btn btn-confirm"
              :disabled="savingProductId === product.id"
              @click="updateProduct(product)"
            >💾 저장</button>
            <button class="btn btn-delete" @click="deleteProduct(product.id)">🗑️ 삭제</button>
          </div>
        </div>
      </div>
      </template>
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

.view-switch {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.view-switch-btn {
  padding: 10px 20px;
  background: transparent;
  color: var(--color-ash);
  border: 1px solid var(--color-hairline);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.view-switch-btn.active,
.view-switch-btn:hover {
  color: var(--color-ink);
  background: var(--color-patina);
  border-color: var(--color-patina);
}

.product-form {
  border: 1px solid var(--color-hairline);
  background: var(--color-surface);
  padding: 20px;
  margin-bottom: 32px;
}

.product-form h3 {
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--color-paper);
  margin: 0 0 16px;
}

.import-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.import-row .url-input {
  flex: 1;
}

.product-form-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 2fr;
  gap: 8px;
  margin-bottom: 16px;
}

.description-input {
  grid-column: 1 / -1;
  resize: vertical;
  min-height: 60px;
  font-family: var(--font-body) !important;
}

.preview {
  margin-bottom: 16px;
}

.preview img {
  max-width: 160px;
  max-height: 160px;
  object-fit: cover;
  border: 1px solid var(--color-hairline);
}

.product-card-image {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border: 1px solid var(--color-hairline);
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.product-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--color-hairline);
  background: var(--color-surface);
  padding: 16px;
}

.product-card input,
.product-card select,
.product-card textarea,
.product-form input,
.product-form select,
.product-form textarea {
  padding: 8px;
  border: 1px solid var(--color-hairline);
  background: var(--color-ink);
  color: var(--color-paper);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  box-sizing: border-box;
  width: 100%;
}

.url-input {
  grid-column: span 1;
}

.product-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn-delete {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.btn-delete:hover {
  background: #ff6b6b;
  color: white;
}

@media (max-width: 900px) {
  .product-form-grid {
    grid-template-columns: 1fr 1fr;
  }
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
