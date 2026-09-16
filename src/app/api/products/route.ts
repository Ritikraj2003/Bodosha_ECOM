import { NextResponse } from 'next/server';
import { createProductFromFormData, updateProductFromFormData } from '@/features/products/actions';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await createProductFromFormData(formData);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to create product via API:', error);
    return NextResponse.json({ success: false, error: 'Failed to create product' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const formData = await request.formData();
    const productId = id || (formData.get('id') as string);

    if (!productId) {
      return NextResponse.json({ success: false, error: 'Product ID is required for update' }, { status: 400 });
    }

    const result = await updateProductFromFormData(productId, formData);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Failed to update product via API:', error);
    return NextResponse.json({ success: false, error: 'Failed to update product' }, { status: 500 });
  }
}
