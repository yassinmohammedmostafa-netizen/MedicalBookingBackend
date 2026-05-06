
import { db } from "@workspace/db";
import { usersTable, doctorsTable } from "@workspace/db";
import { hashPassword } from "../lib/auth";

async function createDoctor() {
  const firstName = 'Dummy';
  const lastName = 'Doctor';
  const email = 'dummy_doctor@esaal.com';
  const password = 'password123';
  const phone = '01234567890';
  const specialty = ['Psychiatry'];
  const type = 'psychiatrist' as const;
  const gender = 'male' as const;
  const price = 500;
  const bio = 'This is a dummy doctor for testing.';
  const yearsExperience = 10;
  const languages = ['Arabic', 'English'];
  const sessionType = 'individual' as const;
  const paymentInfo = 'Vodafone Cash: 01234567890';

  const passwordHash = await hashPassword(password);

  try {
    // Create User
    const [user] = await db.insert(usersTable).values({
      firstName,
      lastName,
      email,
      passwordHash,
      phone,
      role: 'doctor',
      isEmailVerified: true,
      preferredLang: 'en',
    }).returning();

    // Create Doctor Profile
    await db.insert(doctorsTable).values({
      userId: user.id,
      specialty,
      type,
      gender,
      price,
      bio,
      yearsExperience,
      languages,
      sessionType,
      paymentInfo,
      isOnline: false,
      immediateAvailable: false,
      freeConsultation: false,
      rating: 5,
      reviewCount: 0,
      isApproved: true,
    });

    console.log('Doctor created successfully!');
    console.log('Email: ' + email);
    console.log('Password: ' + password);
  } catch (error) {
    console.error('Error creating doctor:', error);
  }
}

createDoctor().then(() => process.exit(0));
