import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { PRODUCT_TYPES, type Product } from '@/api/schemas';
import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { QuantityStepper } from '@/components/quantity-stepper';
import { Segmented } from '@/components/segmented';
import { EmptyState, GridSkeleton } from '@/components/states';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAddProducts,
  useIsOnline,
  useProduct,
  useProductTypes,
  useUpdateProduct,
} from '@/hooks/queries';
import { spacing } from '@/theme';
import {
  emptyProductForm,
  productFormRules,
  productToForm,
  readProductForm,
  type ProductForm,
  type ProductFormErrors,
} from '@/utils/product-form';
import { formatMoney, parseMoney } from '@/utils/products';

/** Adds a sealed product, or, with an `id`, edits one. */
export default function ProductEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const product = useProduct(Number(id ?? 0));

  if (!id) return <Editor />;
  return (
    <ThemedView style={styles.fill}>
      {product.data ? (
        <Editor product={product.data} />
      ) : product.isSuccess ? (
        <EmptyState title="Product not found" message="It may have been deleted elsewhere." />
      ) : (
        <GridSkeleton columns={1} rows={1} />
      )}
    </ThemedView>
  );
}

const STATUSES = [
  { value: 'sealed', label: 'Sealed' },
  { value: 'opened', label: 'Opened' },
] as const;

function Editor({ product }: { product?: Product }) {
  const online = useIsOnline();
  const types = useProductTypes();
  const add = useAddProducts();
  const update = useUpdateProduct();
  const [form, setForm] = useState<ProductForm>(() =>
    product ? productToForm(product) : emptyProductForm(),
  );
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const rules = productFormRules(form, product);
  const typeOptions = (types.data ?? PRODUCT_TYPES).map((type) => ({ value: type, label: type }));

  const set =
    <K extends keyof ProductForm>(key: K) =>
    (value: ProductForm[K]) => {
      setForm((old) => ({ ...old, [key]: value }));
      setErrors((old) => ({ ...old, [key]: undefined }));
    };

  const price = parseMoney(form.price);
  const total = !product && form.quantity > 1 && price !== null ? price * form.quantity : null;
  const busy = add.isPending || update.isPending;

  function save() {
    const result = readProductForm(form, product);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if ('create' in result) {
      add.mutate(
        { product: result.create, quantity: result.quantity },
        { onSuccess: () => router.back() },
      );
    } else if (product) {
      update.mutate(
        { productId: product.id, changes: result.update },
        { onSuccess: () => router.back() },
      );
    }
  }

  const submitTitle = product
    ? 'Save'
    : form.quantity > 1
      ? `Add ${form.quantity} products`
      : 'Add product';

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <Stack.Screen options={{ title: product ? 'Edit product' : 'Add a product' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <TextField
          label="Name"
          placeholder="Surging Sparks Booster Box"
          autoCapitalize="words"
          value={form.name}
          onChangeText={set('name')}
          error={errors.name}
        />
        <View style={styles.group}>
          <ThemedText variant="label">Type</ThemedText>
          <Chips<string>
            label="Type"
            options={typeOptions}
            value={form.type}
            onChange={set('type')}
          />
        </View>
        <TextField
          label={form.quantity > 1 ? 'Price paid, each' : 'Price paid'}
          hint="In euros."
          placeholder="159.99"
          keyboardType="decimal-pad"
          value={form.price}
          onChangeText={set('price')}
          error={errors.price}
        />
        <TextField
          label="Bought on"
          hint="Year, month, day: 2026-10-11."
          placeholder="2026-10-11"
          keyboardType="numbers-and-punctuation"
          value={form.date}
          onChangeText={set('date')}
          error={errors.date}
        />
        {!product ? (
          <View style={styles.row}>
            <View style={styles.text}>
              <ThemedText variant="label">How many</ThemedText>
              <ThemedText variant="caption" color="textSecondary">
                {total !== null
                  ? `${formatMoney(total)} in all. Each is its own product.`
                  : 'Identical ones bought together.'}
              </ThemedText>
            </View>
            <QuantityStepper
              label="How many"
              value={form.quantity}
              onChange={set('quantity')}
              min={1}
              max={200}
            />
          </View>
        ) : null}
        {rules.canChooseStatus ? (
          <Segmented
            label="Status"
            options={STATUSES}
            value={form.status}
            onChange={set('status')}
          />
        ) : null}
        {form.status === 'sealed' ? (
          <TextField
            label="Value now (optional)"
            hint="What it would sell for. Left empty, it counts as what you paid."
            placeholder="175"
            keyboardType="decimal-pad"
            value={form.value}
            onChangeText={set('value')}
            error={errors.value}
          />
        ) : null}
        {rules.canSell ? (
          <View style={styles.group}>
            <ThemedText variant="heading">Sold sealed</ThemedText>
            <TextField
              label="Sold for (optional)"
              hint="What the whole product sold for, in euros. Empty if it has not sold."
              placeholder="210"
              keyboardType="decimal-pad"
              value={form.soldFor}
              onChangeText={set('soldFor')}
              error={errors.soldFor}
            />
            {form.soldFor.trim() ? (
              <TextField
                label="Sold on"
                hint="Year, month, day: 2026-10-11."
                placeholder="2026-10-11"
                keyboardType="numbers-and-punctuation"
                value={form.soldOn}
                onChangeText={set('soldOn')}
                error={errors.soldOn}
              />
            ) : null}
          </View>
        ) : null}
        <TextField
          label="Cardmarket page (optional)"
          hint="The product’s page, to open it from the app."
          placeholder="https://www.cardmarket.com/en/Pokemon/Products/…"
          keyboardType="url"
          textContentType="URL"
          value={form.cardmarketUrl}
          onChangeText={set('cardmarketUrl')}
          error={errors.cardmarketUrl}
        />
        <TextField
          label="Notes (optional)"
          autoCapitalize="sentences"
          autoCorrect
          value={form.notes}
          onChangeText={set('notes')}
        />
        {!online ? (
          <ThemedText variant="caption" color="textSecondary">
            Offline: saving needs a connection.
          </ThemedText>
        ) : null}
        <Button title={submitTitle} busy={busy} disabled={!online} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
});
