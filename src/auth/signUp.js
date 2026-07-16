import { supabase } from '../lib/supabase/supabaseClient.js'
import { redirectLoggedUser } from '../auth/auth-guard.js'

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
    if (result.session) {
      if (messageBox) messageBox.textContent = 'Loading your workspace...'
      try {
        await redirectLoggedUser()
      } catch (error) {
        console.error('Sign-up succeeded, but workspace routing failed:', error)
        if (messageBox) {
          messageBox.textContent = 'Account created, but your profile could not be loaded yet. Try logging in.'
        }
      }
      return
    }

    window.location.href = '../signUp/login.html'
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
  const session = data?.session

  if (!user) {
    return { ok: false, message: 'User could not be created.' }
  }

  return {
    ok: true,
    message: session ? 'Account created successfully.' : 'Account created. Check your email or log in.',
    session,
    user
  }
}
