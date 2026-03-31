import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://vzbgijnwmavmdahybcxw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6Ymdpam53bWF2bWRhaHliY3h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTI3MjMsImV4cCI6MjA4ODU4ODcyM30.OG063dybDyFHI6yz-mOYPjexH85jUWLNrsiULHWuEYE'

export const supabase = createClient('https://vzbgijnwmavmdahybcxw.supabase.co', 'sb_publishable_QPRgN6fF4Pd5EoLeARWZsQ_P8_4FIAO')