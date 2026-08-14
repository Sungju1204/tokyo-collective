<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const password = ref('')
const error = ref('')
const loading = ref(false)

async function login() {
  if (!password.value) {
    error.value = '비번을 입력하세요'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await fetch('http://localhost:3000/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value })
    })

    const data = await response.json()

    if (response.ok) {
      // 토큰 저장
      localStorage.setItem('admin_token', data.token)
      // 대시보드로 이동
      router.push('/admin/dashboard')
    } else {
      error.value = data.error || '비번이 틀렸습니다'
    }
  } catch (err) {
    error.value = '로그인 실패'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function handleKeyup(e) {
  if (e.key === 'Enter') {
    login()
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-box">
      <h1 class="logo-text">TOKYO COLLECTIVE</h1>
      <h2 class="login-title">관리자 로그인</h2>

      <div class="form-group">
        <label for="password">비번</label>
        <input
          id="password"
          v-model="password"
          type="password"
          placeholder="관리자 비번을 입력하세요"
          @keyup="handleKeyup"
          :disabled="loading"
        />
      </div>

      <button
        class="login-button"
        @click="login"
        :disabled="loading || !password"
      >
        {{ loading ? '로그인 중...' : '로그인' }}
      </button>

      <p v-if="error" class="error-message">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-ink);
  padding: 20px;
}

.login-box {
  width: 100%;
  max-width: 400px;
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  padding: 40px;
  box-sizing: border-box;
  text-align: center;
}

.logo-text {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--color-paper);
  margin: 0 0 24px;
  text-transform: uppercase;
}

.login-title {
  font-family: var(--font-body);
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--color-paper);
  margin: 0 0 32px;
}

.form-group {
  margin-bottom: 24px;
  text-align: left;
}

label {
  display: block;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-paper);
  margin-bottom: 8px;
}

input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-hairline);
  background: var(--color-ink);
  color: var(--color-paper);
  font-family: var(--font-body);
  font-size: 1rem;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

input:focus {
  outline: none;
  border-color: var(--color-patina);
  box-shadow: 0 0 0 2px rgba(139, 131, 122, 0.1);
}

input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-button {
  width: 100%;
  padding: 12px;
  background: var(--color-paper);
  color: var(--color-ink);
  border: none;
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.login-button:hover:not(:disabled) {
  opacity: 0.9;
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  color: #ff6b6b;
  font-family: var(--font-body);
  font-size: 0.85rem;
  margin: 16px 0 0;
}
</style>
