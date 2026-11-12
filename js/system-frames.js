(function(){
  const frames = [
    {
      id: 'saov',
      name: 'CLB SAOV',
      description: 'Khung màu và chữ tùy chỉnh',
      options: { color: true, header: false, program: false, event: true, logo: true }
    },
    {
      id: 'computer-science',
      name: 'Computer Science',
      description: 'Gradient, mascot và chữ tùy chỉnh',
      options: { color: false, header: true, program: true, event: true, logo: true }
    }
  ];

  window.SAOV_SYSTEM_FRAMES = Object.freeze(frames);
})();
