import { supabase } from '../lib/supabase/supabaseClient.js'

const form = document.getElementById('login-form')
const messageBox = document.getElementById('message')

form?.addEventListener('submit', async (event) => {
  event.preventDefault()

  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value

  const result = await handleLogin({ email, password })

  if (messageBox) {
    messageBox.textContent = result.message
  }

  if (result.ok) {
    window.location.href = '../app/student-dashboard.html'
  }
})

async function handleLogin({ email, password }) {
  if (!email || !password) {
    return { ok: false, message: 'Enter email and password.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    return { ok: false, message: error.message }
  }

  const session = data?.session
  const user = data?.user

  if (!session || !user) {
    return { ok: false, message: 'Invalid login.' }
  }

  return { ok: true, message: 'Login successful.', user }
}
