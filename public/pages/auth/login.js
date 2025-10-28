// Main JavaScript Functions

// Switch between Login and Register tabs
function switchTab(tab) {
  const tabMasuk = document.getElementById('tabMasuk');
  const tabDaftar = document.getElementById('tabDaftar');
  const formMasuk = document.getElementById('formMasuk');
  const formDaftar = document.getElementById('formDaftar');

  if (tab === 'masuk') {
    tabMasuk.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
    tabMasuk.classList.remove('text-gray-500');
    tabDaftar.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
    tabDaftar.classList.add('text-gray-500');
    formMasuk.classList.remove('hidden');
    formDaftar.classList.add('hidden');
  } else {
    tabDaftar.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
    tabDaftar.classList.remove('text-gray-500');
    tabMasuk.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
    tabMasuk.classList.add('text-gray-500');
    formDaftar.classList.remove('hidden');
    formMasuk.classList.add('hidden');
  }
  hideAlert();
}

// Toggle password visibility
function togglePassword(inputId) {
  const passwordInput = document.getElementById(inputId);
  const button = event.currentTarget;
  const svg = button.querySelector('svg');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    // Ganti icon ke "eye-off" jika perlu
  } else {
    passwordInput.type = 'password';
    // Ganti icon ke "eye" jika perlu
  }
}

// Show alert message
function showAlert(message, type) {
  const alertDiv = document.getElementById('alertMessage');
  if (!alertDiv) return;
  
  alertDiv.textContent = message;
  alertDiv.className = `mt-4 p-4 rounded-xl text-sm ${
    type === 'success' 
      ? 'bg-green-100 text-green-700 border border-green-300' 
      : 'bg-red-100 text-red-700 border border-red-300'
  }`;
  alertDiv.classList.remove('hidden');
  
  // Auto hide after 5 seconds
  setTimeout(() => {
    hideAlert();
  }, 5000);
}

// Hide alert message
function hideAlert() {
  const alertDiv = document.getElementById('alertMessage');
  if (alertDiv) {
    alertDiv.classList.add('hidden');
  }
}

// Format phone number
function formatPhoneNumber(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.startsWith('0')) {
    value = '62' + value.substring(1);
  }
  input.value = value;
}

// Validate email format
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Show loading state
function showLoading(buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Loading...';
  }
}

// Hide loading state
function hideLoading(buttonId, originalText) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

// Initialize tooltips or other UI components
document.addEventListener('DOMContentLoaded', function() {
  console.log('Page loaded successfully');
  
  // Add phone number formatter if input exists
  const phoneInput = document.getElementById('registerPhone');
  if (phoneInput) {
    phoneInput.addEventListener('blur', function() {
      formatPhoneNumber(this);
    });
  }
});