import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { personId, firstName, lastName, fullName, gender, birthDate, deathDate, grewUpLocation, occupation, proudOf, story, interests, photoUrl } = await request.json();

    if (!personId) {
      return NextResponse.json({ error: "Missing personId" }, { status: 400 });
    }

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (fullName !== undefined) updateData.fullName = fullName;
    if (gender !== undefined) updateData.gender = gender;
    if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null;
    if (deathDate !== undefined) updateData.deathDate = deathDate ? new Date(deathDate) : null;
    if (grewUpLocation !== undefined) updateData.grewUpLocation = grewUpLocation;
    if (occupation !== undefined) updateData.occupation = occupation;
    if (proudOf !== undefined) updateData.proudOf = proudOf;
    if (story !== undefined) updateData.bio = story; // schema uses 'bio'
    if (interests !== undefined) updateData.interests = interests;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;

    const updated = await prisma.person.update({
      where: { id: personId },
      data: updateData,
      select: {
         id: true,
         fullName: true,
         gender: true,
         birthDate: true
      }
    });

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("Save profile error:", error);
    return NextResponse.json({ error: "Failed to save: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
