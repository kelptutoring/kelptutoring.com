import { supabase } from '../lib/supabase/supabaseClient.js'
import { redirectLoggedUser, redirectLoggedUserAwayFromAuthPage } from '../auth/auth-guard.js'

const form = document.getElementById('login-form')
const messageBox = document.getElementById('message')
const submitButton = form?.querySelector('button[type="submit"]')

redirectLoggedUserAwayFromAuthPage().catch((error) => {
  console.info('Login page could not pre-route an existing session.', error)
})

form?.addEventListener('submit', async (event) => {
  event.preventDefault()

  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value

  setBusy(true)
  const result = await handleLogin({ email, password })
  setBusy(false)

  if (messageBox) {
    messageBox.textContent = result.message
  }

  if (result.ok) {
    if (messageBox) messageBox.textContent = 'Loading your workspace...'
    try {
      await redirectLoggedUser()
    } catch (error) {
      console.error('Login succeeded, but workspace routing failed:', error)
      if (messageBox) {
        messageBox.textContent = 'Login succeeded, but your profile could not be loaded yet.'
      }
    }
  }
})

function setBusy(isBusy) {
  if (!submitButton) return
  submitButton.disabled = isBusy
  submitButton.textContent = isBusy ? 'Logging in...' : 'Login'
}

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
