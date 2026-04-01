import { supabase } from '../lib/supabase/supabaseClient.js'

const form = document.getElementById('signup-form')
const messageBox = document.getElementById('message')

form?.addEventListener('submit', async (event) => {
  event.preventDefault()

  const fullName = document.getElementById('fullName').value.trim()
  const birthDate = document.getElementById('birthDate').value
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value

  const result = await handleSignUp({
    fullName,
    email,
    password,
    birthDate
  })

  if (messageBox) {
    messageBox.textContent = result.message
  }

  if (result.ok) {
    window.location.href = '../login/login.html'
  }
})

async function handleSignUp({ fullName, email, password, birthDate }) {
  if (!fullName || !email || !password) {
    return { ok: false, message: 'Fill in the required fields.' }
  }

  if (password.length < 6) {
    return { ok: false, message: 'Password must have at least 6 characters.' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        birth_date: birthDate || null,
        role: 'student'
      }
    }
  })

  if (error) {
    return { ok: false, message: error.message }
  }

  const user = data?.user

  if (!user) {
    return { ok: false, message: 'User could not be created.' }
  }

  return { ok: true, message: 'Account created successfully.' }
}
