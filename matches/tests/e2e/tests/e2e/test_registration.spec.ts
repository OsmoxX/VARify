import { test, expect } from './fixtures';

// Funkcja pomocnicza do generowania losowych danych tekstowych
// Używamy jej, aby każdy test rejestracji tworzył unikalnego użytkownika
function generateRandomString(length = 8): string {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

test.describe('User Registration Flow', () => {

    test('should successfully register a new user with valid data', async ({ page }) => {
        // 1. Przejdź na stronę rejestracji (baseURL jest ustawiony w configu)
        await page.goto('/register/');
        const randomPrefix = generateRandomString();
        const username = `user_${randomPrefix}`;
        const email = `${username}@example.com`;
        const password = 'StrongPassword123!';

        // --- Wypełnianie formularza na podstawie etykiet (Labels) z image_8.png ---
        
        // Wpisz nazwę użytkownika w pole "USERNAME"
        await page.getByLabel('USERNAME').fill(username);

        // Wpisz adres e-mail w pole "EMAIL ADDRESS"
        await page.getByLabel('EMAIL ADDRESS').fill(email);

        await page.locator('#id_password1').fill(password);

        // Wpisz potwierdzenie hasła w pole "CONFIRM PASSWORD"
        await page.getByLabel('CONFIRM PASSWORD').fill(password);

        // Kliknij przycisk "Create Account", aby wysłać formularz
        await page.getByRole('button', { name: 'Create Account' }).click();
        await page.waitForLoadState('networkidle');

        // Asercja 1: Sprawdź, czy nastąpiło przekierowanie na stronę logowania
        // Zakładamy, że w adresie URL pojawi się słowo "login"
        await expect(page).toHaveURL(/login/);

        // Asercja 2: Sprawdź, czy widoczny jest komunikat o sukcesie
        // WAŻNE: Wklej tutaj DOKŁADNY tekst, który wyświetla Twoja aplikacja po polsku
        const successMessage = page.getByText(`Konto dla ${username} zostało utworzone! Możesz się zalogować.`);
        await expect(successMessage).toBeVisible();
    });

    test('should show validation errors when submitting an empty form', async ({ page }) => {
        // 1. Przejdź na stronę rejestracji
        await page.goto('/register/');

        // 2. Kliknij przycisk wysłania bez wypełniania jakichkolwiek pól
        await page.getByRole('button', { name: 'Create Account' }).click();

        // --- ASERCJE (Sprawdzanie błędów walidacji) ---
        
        // Sprawdź, czy pokazał się komunikat o błędzie dla wymaganego pola
        // Zakładamy, że Twoja aplikacja wyświetla polski komunikat "To pole jest wymagane."
        const requiredFieldErrors = page.getByText('This field is required.');
        
        // expect().to_be_visible() poczeka, aż błąd pojawi się na ekranie
        await expect(requiredFieldErrors).toHaveCount(4);
    });

});