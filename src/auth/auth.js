import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

const supabaseUrl = "SEU_SUPABASE_URL"
const supabaseKey = "SUA_ANON_PUBLIC_KEY"

const supabase = createClient(supabaseUrl, supabaseKey)

async function signUp() {

const email = document.getElementById("email").value
const password = document.getElementById("password").value

const { data, error } = await supabase.auth.signUp({
  email: email,
  password: password
})

if(error){
alert(error.message)
} else {
alert("Check your email to confirm signup")
}

}

async function login(){

const email = document.getElementById("email").value
const password = document.getElementById("password").value

const { data, error } = await supabase.auth.signInWithPassword({
email: email,
password: password
})

if(error){
alert(error.message)
}else{
window.location.href = "dashboard.html"
}

}

async function loginGoogle(){

await supabase.auth.signInWithOAuth({
provider: "google"
})

}

window.signUp = signUp
window.login = login
window.loginGoogle = loginGoogle