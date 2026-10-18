
import { supabase } from './supabase';

export type Role = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export async function getProfile(
  userId: string
): Promise<Profile | null> {
  if (!userId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Could not load profile:', error.message);
      return null;
    }

    if (!data) {
      return null;
    }

    if (
      data.role !== 'student' &&
      data.role !== 'teacher' &&
      data.role !== 'admin'
    ) {
      console.error('Invalid profile role.');
      return null;
    }

    return data as Profile;
  } catch (error) {
    console.error('Unexpected profile loading error:', error);
    return null;
  }
}

export async function updateProfile(
  userId: string,
  updates: { full_name?: string }
): Promise<{ error: string | null }> {
  if (!userId) {
    return {
      error: 'Please log in before updating your profile.',
    };
  }

  const cleanedUpdates: { full_name?: string } = {};

  if (updates.full_name !== undefined) {
    const fullName = updates.full_name.trim();

    if (!fullName) {
      return {
        error: 'Full name cannot be empty.',
      };
    }

    if (fullName.length > 100) {
      return {
        error: 'Full name must be 100 characters or fewer.',
      };
    }

    cleanedUpdates.full_name = fullName;
  }

  if (Object.keys(cleanedUpdates).length === 0) {
    return {
      error: 'There are no profile changes to save.',
    };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || user.id !== userId) {
      return {
        error: 'You can only update your own profile.',
      };
    }

    const { error } = await supabase
      .from('profiles')
      .update(cleanedUpdates)
      .eq('id', userId);

    if (error) {
      console.error('Profile update failed:', error.message);

      return {
        error: 'Could not update your profile. Please try again.',
      };
    }

    return { error: null };
  } catch (error) {
    console.error('Unexpected profile update error:', error);

    return {
      error: 'Something went wrong while updating your profile.',
    };
  }
}