import { createClient } from "@supabase/supabase-js"

const supabase = createClient('https://vzbgijnwmavmdahybcxw.supabase.co', 'sb_publishable_QPRgN6fF4Pd5EoLeARWZsQ_P8_4FIAO')

async function checkUser(){

const { data } = await supabase.auth.getUser()

if(!data.user){
window.location.href = "login.html"
}

}

checkUser()