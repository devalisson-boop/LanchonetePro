import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { BackofficeHeader } from '../components/backoffice-header';
import { apiFetch } from '../lib/api';
import { useAuth } from '../providers/auth-provider';

type Category = {
  id: string;
  name: string;
};

type Ingredient = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  description: string | null;
  supplierName: string | null;
  costPerUnit: number;
  stockQuantity: number;
  minimumStockLevel: number;
  isActive: boolean;
};

type ProductRecipeItem = {
  ingredientId: string;
  ingredientName: string;
  ingredientSku: string | null;
  unit: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  isActive: boolean;
};

type Product = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  costPrice: number | null;
  stockQuantity: number;
  minimumStockLevel: number;
  imageUrl: string | null;
  isAvailable: boolean;
  recipe: ProductRecipeItem[];
  recipeCost: number;
};

type ProductFormState = {
  editingId: string | null;
  name: string;
  categoryId: string;
  description: string;
  price: string;
  costPrice: string;
  stockQuantity: string;
  minimumStockLevel: string;
  imageUrl: string;
  isAvailable: boolean;
  recipe: Array<{
    ingredientId: string;
    quantity: string;
  }>;
};

type IngredientFormState = {
  editingId: string | null;
  name: string;
  sku: string;
  unit: string;
  description: string;
  supplierName: string;
  costPerUnit: string;
  stockQuantity: string;
  minimumStockLevel: string;
  isActive: boolean;
};

type ActiveTab = 'products' | 'ingredients';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const emptyProductForm = (): ProductFormState => ({
  editingId: null,
  name: '',
  categoryId: '',
  description: '',
  price: '',
  costPrice: '',
  stockQuantity: '',
  minimumStockLevel: '',
  imageUrl: '',
  isAvailable: true,
  recipe: [],
});

const emptyIngredientForm = (): IngredientFormState => ({
  editingId: null,
  name: '',
  sku: '',
  unit: 'un',
  description: '',
  supplierName: '',
  costPerUnit: '',
  stockQuantity: '',
  minimumStockLevel: '',
  isActive: true,
});

function parseOptionalNumber(value: string) {
  if (value.trim() === '') {
    return undefined;
  }

  return Number(value);
}

export function ProductsManagementPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [submittingIngredient, setSubmittingIngredient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [ingredientForm, setIngredientForm] = useState<IngredientFormState>(emptyIngredientForm);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [categoryData, productData, ingredientData] = await Promise.all([
        apiFetch<Category[]>('categories'),
        apiFetch<Product[]>('products'),
        apiFetch<Ingredient[]>('ingredients'),
      ]);

      setCategories(categoryData);
      setProducts(productData);
      setIngredients(ingredientData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o modulo de produtos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadData();
  }, [session]);

  const ingredientOptions = useMemo(() => ingredients, [ingredients]);

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingProduct(true);
    setError(null);
    setSuccess(null);

    try {
      const recipe = productForm.recipe
        .filter((item) => item.ingredientId && item.quantity.trim() !== '')
        .map((item) => ({
          ingredientId: item.ingredientId,
          quantity: Number(item.quantity),
        }));

      await apiFetch<Product>(
        productForm.editingId ? `products/${productForm.editingId}` : 'products',
        {
          method: productForm.editingId ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: productForm.name,
            categoryId: productForm.categoryId || undefined,
            description: productForm.description || undefined,
            price: Number(productForm.price),
            costPrice: parseOptionalNumber(productForm.costPrice),
            stockQuantity: parseOptionalNumber(productForm.stockQuantity),
            minimumStockLevel: parseOptionalNumber(productForm.minimumStockLevel),
            imageUrl: productForm.imageUrl || undefined,
            isAvailable: productForm.isAvailable,
            recipe,
          }),
        },
      );

      setSuccess(productForm.editingId ? 'Produto atualizado com sucesso.' : 'Produto criado com sucesso.');
      setProductForm(emptyProductForm());
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao salvar o produto.');
    } finally {
      setSubmittingProduct(false);
    }
  }

  async function handleIngredientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingIngredient(true);
    setError(null);
    setSuccess(null);

    try {
      await apiFetch<Ingredient>(
        ingredientForm.editingId ? `ingredients/${ingredientForm.editingId}` : 'ingredients',
        {
          method: ingredientForm.editingId ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: ingredientForm.name,
            sku: ingredientForm.sku || undefined,
            unit: ingredientForm.unit,
            description: ingredientForm.description || undefined,
            supplierName: ingredientForm.supplierName || undefined,
            costPerUnit: parseOptionalNumber(ingredientForm.costPerUnit),
            stockQuantity: parseOptionalNumber(ingredientForm.stockQuantity),
            minimumStockLevel: parseOptionalNumber(ingredientForm.minimumStockLevel),
            isActive: ingredientForm.isActive,
          }),
        },
      );

      setSuccess(ingredientForm.editingId ? 'Ingrediente atualizado com sucesso.' : 'Ingrediente criado com sucesso.');
      setIngredientForm(emptyIngredientForm());
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao salvar o ingrediente.');
    } finally {
      setSubmittingIngredient(false);
    }
  }

  function startEditProduct(product: Product) {
    setActiveTab('products');
    setProductForm({
      editingId: product.id,
      name: product.name,
      categoryId: product.categoryId ?? '',
      description: product.description ?? '',
      price: String(product.price),
      costPrice: product.costPrice !== null ? String(product.costPrice) : '',
      stockQuantity: String(product.stockQuantity),
      minimumStockLevel: String(product.minimumStockLevel),
      imageUrl: product.imageUrl ?? '',
      isAvailable: product.isAvailable,
      recipe: product.recipe.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: String(item.quantity),
      })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startEditIngredient(ingredient: Ingredient) {
    setActiveTab('ingredients');
    setIngredientForm({
      editingId: ingredient.id,
      name: ingredient.name,
      sku: ingredient.sku ?? '',
      unit: ingredient.unit,
      description: ingredient.description ?? '',
      supplierName: ingredient.supplierName ?? '',
      costPerUnit: String(ingredient.costPerUnit),
      stockQuantity: String(ingredient.stockQuantity),
      minimumStockLevel: String(ingredient.minimumStockLevel),
      isActive: ingredient.isActive,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Excluir o produto "${product.name}"?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await apiFetch<{ success: boolean }>(`products/${product.id}`, {
        method: 'DELETE',
      });
      setSuccess('Produto excluido com sucesso.');
      if (productForm.editingId === product.id) {
        setProductForm(emptyProductForm());
      }
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Falha ao excluir o produto.');
    }
  }

  async function deleteIngredient(ingredient: Ingredient) {
    if (!window.confirm(`Excluir o ingrediente "${ingredient.name}"?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await apiFetch<{ success: boolean }>(`ingredients/${ingredient.id}`, {
        method: 'DELETE',
      });
      setSuccess('Ingrediente excluido com sucesso.');
      if (ingredientForm.editingId === ingredient.id) {
        setIngredientForm(emptyIngredientForm());
      }
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Falha ao excluir o ingrediente.');
    }
  }

  function addRecipeRow() {
    setProductForm((current) => ({
      ...current,
      recipe: [
        ...current.recipe,
        {
          ingredientId: '',
          quantity: '',
        },
      ],
    }));
  }

  function updateRecipeRow(index: number, field: 'ingredientId' | 'quantity', value: string) {
    setProductForm((current) => ({
      ...current,
      recipe: current.recipe.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    }));
  }

  function removeRecipeRow(index: number) {
    setProductForm((current) => ({
      ...current,
      recipe: current.recipe.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  const productCostPreview = productForm.recipe.reduce((sum, row) => {
    const ingredient = ingredients.find((item) => item.id === row.ingredientId);
    const quantity = Number(row.quantity);

    if (!ingredient || Number.isNaN(quantity)) {
      return sum;
    }

    return sum + ingredient.costPerUnit * quantity;
  }, 0);

  return (
    <main className="dashboard-shell">
      <BackofficeHeader
        title="Gestao de Produtos"
        subtitle="Cadastre produtos, monte fichas tecnicas e mantenha seus ingredientes organizados."
        onRefresh={() => void loadData()}
      />

      <section className="tabs-panel">
        <div className="tabs-switcher">
          <button
            className={activeTab === 'products' ? 'tab tab--active' : 'tab'}
            onClick={() => setActiveTab('products')}
            type="button"
          >
            Produtos
          </button>
          <button
            className={activeTab === 'ingredients' ? 'tab tab--active' : 'tab'}
            onClick={() => setActiveTab('ingredients')}
            type="button"
          >
            Ingredientes
          </button>
        </div>

        {error && <div className="banner banner--error">{error}</div>}
        {success && <div className="banner banner--success">{success}</div>}
      </section>

      {loading ? (
        <div className="screen-state">Carregando modulo de produtos...</div>
      ) : (
        <>
          {activeTab === 'products' && (
            <section className="management-grid">
              <article className="panel">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Cadastro</p>
                    <h2>{productForm.editingId ? 'Editar produto' : 'Novo produto'}</h2>
                  </div>
                  {productForm.editingId && (
                    <button className="ghost-button" onClick={() => setProductForm(emptyProductForm())} type="button">
                      Limpar
                    </button>
                  )}
                </div>

                <form className="management-form" onSubmit={handleProductSubmit}>
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        value={productForm.name}
                        onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Categoria
                      <select
                        value={productForm.categoryId}
                        onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Preco de venda
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={productForm.price}
                        onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Custo base
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={productForm.costPrice}
                        onChange={(event) => setProductForm((current) => ({ ...current, costPrice: event.target.value }))}
                      />
                    </label>

                    <label>
                      Estoque atual
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={productForm.stockQuantity}
                        onChange={(event) => setProductForm((current) => ({ ...current, stockQuantity: event.target.value }))}
                      />
                    </label>

                    <label>
                      Estoque minimo
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={productForm.minimumStockLevel}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, minimumStockLevel: event.target.value }))
                        }
                      />
                    </label>

                    <label className="form-grid__full">
                      URL da imagem
                      <input
                        value={productForm.imageUrl}
                        onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))}
                      />
                    </label>

                    <label className="form-grid__full">
                      Descricao
                      <textarea
                        rows={3}
                        value={productForm.description}
                        onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>

                    <label className="checkbox-row">
                      <input
                        checked={productForm.isAvailable}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, isAvailable: event.target.checked }))
                        }
                        type="checkbox"
                      />
                      Produto disponivel para venda
                    </label>
                  </div>

                  <div className="recipe-section">
                    <div className="panel__header">
                      <div>
                        <p className="eyebrow">Ficha Tecnica</p>
                        <h2>Ingredientes do produto</h2>
                      </div>
                      <button className="ghost-button" onClick={addRecipeRow} type="button">
                        Adicionar ingrediente
                      </button>
                    </div>

                    {productForm.recipe.length === 0 ? (
                      <div className="empty-state">Nenhum ingrediente vinculado ainda.</div>
                    ) : (
                      <div className="recipe-list">
                        {productForm.recipe.map((item, index) => (
                          <div className="recipe-row" key={`${item.ingredientId}-${index}`}>
                            <select
                              value={item.ingredientId}
                              onChange={(event) => updateRecipeRow(index, 'ingredientId', event.target.value)}
                            >
                              <option value="">Selecione um ingrediente</option>
                              {ingredientOptions.map((ingredient) => (
                                <option key={ingredient.id} value={ingredient.id}>
                                  {ingredient.name} ({ingredient.unit}) {ingredient.isActive ? '' : '- inativo'}
                                </option>
                              ))}
                            </select>

                            <input
                              min="0.001"
                              step="0.001"
                              type="number"
                              value={item.quantity}
                              onChange={(event) => updateRecipeRow(index, 'quantity', event.target.value)}
                              placeholder="Quantidade"
                            />

                            <button className="danger-button" onClick={() => removeRecipeRow(index)} type="button">
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="muted">Custo estimado da receita: {currency.format(productCostPreview)}</p>
                  </div>

                  <div className="form-actions">
                    <button className="primary-button" disabled={submittingProduct} type="submit">
                      {submittingProduct
                        ? 'Salvando...'
                        : productForm.editingId
                          ? 'Atualizar produto'
                          : 'Criar produto'}
                    </button>
                  </div>
                </form>
              </article>

              <article className="panel">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Catalogo</p>
                    <h2>Produtos cadastrados</h2>
                  </div>
                  <span className="muted">{products.length} produtos</span>
                </div>

                <div className="management-list">
                  {products.map((product) => (
                    <div className="management-card" key={product.id}>
                      <div className="management-card__header">
                        <div>
                          <strong>{product.name}</strong>
                          <span>
                            {product.categoryName || 'Sem categoria'} | {currency.format(product.price)}
                          </span>
                        </div>
                        <span className={product.isAvailable ? 'status-chip status-chip--delivered' : 'status-chip status-chip--cancelled'}>
                          {product.isAvailable ? 'ativo' : 'indisponivel'}
                        </span>
                      </div>

                      <div className="management-card__meta">
                        <span>Receita: {product.recipe.length} ingredientes</span>
                        <span>Custo estimado: {currency.format(product.recipeCost)}</span>
                        <span>Estoque: {product.stockQuantity}</span>
                      </div>

                      {product.recipe.length > 0 && (
                        <ul className="inline-list">
                          {product.recipe.map((item) => (
                            <li key={item.ingredientId}>
                              {item.ingredientName}: {item.quantity} {item.unit}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="inline-actions">
                        <button className="ghost-button" onClick={() => startEditProduct(product)} type="button">
                          Editar
                        </button>
                        <button className="danger-button" onClick={() => void deleteProduct(product)} type="button">
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}

                  {products.length === 0 && <div className="empty-state">Nenhum produto cadastrado ainda.</div>}
                </div>
              </article>
            </section>
          )}

          {activeTab === 'ingredients' && (
            <section className="management-grid">
              <article className="panel">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Insumos</p>
                    <h2>{ingredientForm.editingId ? 'Editar ingrediente' : 'Novo ingrediente'}</h2>
                  </div>
                  {ingredientForm.editingId && (
                    <button className="ghost-button" onClick={() => setIngredientForm(emptyIngredientForm())} type="button">
                      Limpar
                    </button>
                  )}
                </div>

                <form className="management-form" onSubmit={handleIngredientSubmit}>
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        value={ingredientForm.name}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, name: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      SKU
                      <input
                        value={ingredientForm.sku}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, sku: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      Unidade
                      <input
                        value={ingredientForm.unit}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, unit: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Fornecedor
                      <input
                        value={ingredientForm.supplierName}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, supplierName: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      Custo por unidade
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={ingredientForm.costPerUnit}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, costPerUnit: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      Estoque atual
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={ingredientForm.stockQuantity}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, stockQuantity: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      Estoque minimo
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={ingredientForm.minimumStockLevel}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, minimumStockLevel: event.target.value }))
                        }
                      />
                    </label>

                    <label className="form-grid__full">
                      Descricao
                      <textarea
                        rows={3}
                        value={ingredientForm.description}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </label>

                    <label className="checkbox-row">
                      <input
                        checked={ingredientForm.isActive}
                        onChange={(event) =>
                          setIngredientForm((current) => ({ ...current, isActive: event.target.checked }))
                        }
                        type="checkbox"
                      />
                      Ingrediente ativo no cardapio e nas fichas tecnicas
                    </label>
                  </div>

                  <div className="form-actions">
                    <button className="primary-button" disabled={submittingIngredient} type="submit">
                      {submittingIngredient
                        ? 'Salvando...'
                        : ingredientForm.editingId
                          ? 'Atualizar ingrediente'
                          : 'Criar ingrediente'}
                    </button>
                  </div>
                </form>
              </article>

              <article className="panel">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Estoque Base</p>
                    <h2>Ingredientes cadastrados</h2>
                  </div>
                  <span className="muted">{ingredients.length} ingredientes</span>
                </div>

                <div className="management-list">
                  {ingredients.map((ingredient) => {
                    const isLowStock = ingredient.stockQuantity <= ingredient.minimumStockLevel;

                    return (
                      <div className="management-card" key={ingredient.id}>
                        <div className="management-card__header">
                          <div>
                            <strong>{ingredient.name}</strong>
                            <span>{ingredient.sku || 'Sem SKU'} | {ingredient.unit}</span>
                          </div>
                          <span className={ingredient.isActive ? 'status-chip status-chip--delivered' : 'status-chip status-chip--cancelled'}>
                            {ingredient.isActive ? 'ativo' : 'inativo'}
                          </span>
                        </div>

                        <div className="management-card__meta">
                          <span>Custo: {currency.format(ingredient.costPerUnit)}</span>
                          <span>Estoque: {ingredient.stockQuantity}</span>
                          <span className={isLowStock ? 'text-danger' : undefined}>
                            Minimo: {ingredient.minimumStockLevel}
                          </span>
                        </div>

                        {(ingredient.description || ingredient.supplierName) && (
                          <p className="muted">
                            {ingredient.description || 'Sem descricao'} {ingredient.supplierName ? `| ${ingredient.supplierName}` : ''}
                          </p>
                        )}

                        <div className="inline-actions">
                          <button className="ghost-button" onClick={() => startEditIngredient(ingredient)} type="button">
                            Editar
                          </button>
                          <button className="danger-button" onClick={() => void deleteIngredient(ingredient)} type="button">
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {ingredients.length === 0 && <div className="empty-state">Nenhum ingrediente cadastrado ainda.</div>}
                </div>
              </article>
            </section>
          )}
        </>
      )}
    </main>
  );
}
