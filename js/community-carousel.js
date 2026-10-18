// Isolated from authentication and food-post data.
(() => {
  const carousel = document.querySelector('.sharing-carousel');
  if (!carousel) return;
  const track = carousel.querySelector('.sharing-track');
  const group = track.querySelector('.sharing-group');
  // Two identical groups make the -50% translation loop seamlessly.
  const duplicate = group.cloneNode(true);
  duplicate.setAttribute('aria-hidden', 'true');
  duplicate.setAttribute('inert', '');
  duplicate.querySelectorAll('img').forEach(image => { image.alt = ''; });
  track.append(duplicate);
  carousel.classList.add('is-enhanced');
  // Stop rendering motion when the gallery is outside the viewport.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      carousel.classList.toggle('is-offscreen', !entries[0].isIntersecting);
    }).observe(carousel);
  }
})();


  const testimonials = document.querySelector('.testimonials-section');
  if (testimonials) {
    const testimonialTrack = testimonials.querySelector('.testimonials-track');
    const testimonialGroup = testimonialTrack?.querySelector('.testimonials-group');
    if (testimonialTrack && testimonialGroup) {
      const testimonialDuplicate = testimonialGroup.cloneNode(true);
      testimonialDuplicate.setAttribute('aria-hidden', 'true');
      testimonialDuplicate.setAttribute('inert', '');
      testimonialTrack.append(testimonialDuplicate);
      testimonials.classList.add('is-enhanced');

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          testimonials.classList.toggle('is-offscreen', !entries[0].isIntersecting);
        }).observe(testimonials);
      }
    }
  }
