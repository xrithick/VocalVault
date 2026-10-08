// VocalVault Client-side JavaScript

document.addEventListener('DOMContentLoaded', () => {
    // 1. Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach((alert) => {
        setTimeout(() => {
            alert.style.transition = 'opacity 0.5s ease';
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 500);
        }, 5000);
    });

    // 2. Edit Song Modal Handler
    const editModal = document.getElementById('editSongModal');
    if (editModal) {
        const closeBtn = editModal.querySelector('.modal-close');
        const cancelBtn = editModal.querySelector('.modal-cancel');
        const editForm = document.getElementById('editSongForm');

        const closeModal = () => {
            editModal.classList.remove('active');
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        // Close on background click
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                closeModal();
            }
        });

        // Open modal when clicking edit button
        document.querySelectorAll('.btn-edit-song').forEach((button) => {
            button.addEventListener('click', () => {
                const id = button.dataset.id;
                const name = button.dataset.name;
                const artist = button.dataset.artist;
                const language = button.dataset.language;
                const difficulty = button.dataset.difficulty;

                editForm.action = `/songs/edit/${id}`;
                document.getElementById('edit_song_name').value = name;
                document.getElementById('edit_artist').value = artist;
                document.getElementById('edit_language').value = language;
                document.getElementById('edit_difficulty').value = difficulty;

                editModal.classList.add('active');
            });
        });
    }
});
